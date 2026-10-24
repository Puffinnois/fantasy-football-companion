// Explore › Chart — view-model spec for the chart explorer (README §15).
// Mockups: Main.dc.html (WR volume vs efficiency), ChartTeamsDark.dc.html (teams, offense vs defense EPA),
// ChartFew.dc.html (too few qualifiers). Data: window.api.stats.catalogue() → MetricInfo[],
// window.api.stats.query(StatsQuery) → StatsResult, window.api.stats.ownership() → my players.
// Same shape as the handoff's other view-models: init(c) loads, view(c) derives everything the template binds.
(() => {
  const msg = (e) => String((e && e.message) || e);
  const POS = ['QB', 'RB', 'WR', 'TE'];
  const FAMILIES = [['traditional', 'Traditional'], ['advanced', 'Advanced'], ['ngs', 'Next Gen'], ['charting', 'Charting'], ['predictive', 'Predictive']];
  // Presets per entity. A preset is just an (x, y) pair plus the position it implies; picking an axis by hand clears it.
  const PRESETS = {
    player: [
      { id: 've', label: 'Volume vs efficiency', pos: 'WR', x: 'targets', y: 'yprr', perGame: true },
      { id: 'ta', label: 'Targets vs air yards', pos: 'WR', x: 'targets', y: 'air_yards_share', perGame: true },
    ],
    team: [
      { id: 'ps', label: 'Pressure vs sack rate', x: 'off_pressure_rate', y: 'off_sack_rate' },
      { id: 'od', label: 'Offense vs defense EPA', x: 'off_epa_play', y: 'def_epa_play' },
    ],
  };
  // Corner words, [good, bad], for the quadrant labels ("High volume, efficient"). A metric without an entry
  // falls back to "more <short>" / "less <short>" (flipped for lower-is-better).
  const WORDS = {
    targets: ['high volume', 'low volume'], yprr: ['efficient', 'inefficient'], air_yards_share: ['deep usage', 'short usage'],
    separation: ['gets open', 'covered'], drop_rate: ['sure hands', 'drops'],
    off_epa_play: ['good offense', 'poor offense'], def_epa_play: ['good defense', 'poor defense'],
    off_pressure_rate: ['clean pocket', 'leaky pocket'], off_sack_rate: ['few sacks', 'many sacks'],
  };
  const MIN_DOTS = 10; // below this the scatter says nothing: show the "too few qualifiers" state
  const PLOT = { W: 952, H: 430, L: 56, R: 18, T: 28, B: 44 }; // chart box; the plot is inside the margins
  const EXTREME_LABELS = 6; // players: label this many dots farthest from the centre (teams label all 32)

  function init(c) {
    Promise.all([window.api.stats.catalogue(), window.api.stats.status(), window.api.stats.ownership()])
      .then(([cat, status, own]) => {
        if (!c._alive) return;
        const season = status.through ? status.through.season : new Date().getFullYear();
        const week = status.through ? status.through.week : 1;
        c._cat = new Map(cat.map((m) => [m.id, m]));
        c.setState({ season, wFrom: 1, wTo: week, lastWeek: week, mine: new Set((own.players || []).map((p) => p.id)), booted: true });
      })
      .catch((e) => c._alive && c.setState({ err: msg(e) }));
  }

  // One query per (entity, pos, season, weeks, x, y, third): every qualified-or-not row at the position.
  // Qualified only is applied client-side so toggling it does not refetch and the count note stays honest.
  function load(c, q) {
    const key = JSON.stringify(q);
    if (c._key === key) return;
    c._key = key;
    c.setState({ rows: null });
    window.api.stats.query(q)
      .then((r) => c._alive && c._key === key && c.setState({ rows: r.rows, notes: r.notes, columns: r.columns }))
      .catch((e) => c._alive && c._key === key && c.setState({ err: msg(e) }));
  }

  const ticks = (lo, hi, n) => {
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const words = (m) => WORDS[m.id] || (m.direction === 'lower' ? ['less ' + m.short, 'more ' + m.short] : ['more ' + m.short, 'less ' + m.short]);
  const chip = (p) => (p == null ? { pct: '—', tone: 'none' } : { pct: Math.round(p), tone: p >= 75 ? 'good' : p <= 25 ? 'bad' : 'mid' });
  // A metric with no data for the season: before its firstSeason, or a `lastSeason: 'prior'` metric in the current one.
  const unpublished = (m, season, current) => season < m.firstSeason || (m.lastSeason === 'prior' && season >= current);

  // Greedy collision-free labels: right, left, above, below; skip when all four collide or leave the plot.
  function placeLabels(items, charW) {
    const boxes = [], out = [];
    const L = PLOT.L + 2, R = PLOT.W - PLOT.R - 2, T = PLOT.T + 2, B = PLOT.H - PLOT.B - 2;
    items.forEach(({ p, text, kind }) => {
      const w = text.length * charW + 2, h = 13, o = p.r + 4;
      const cands = [[p.cx + o, p.cy - 7], [p.cx - o - w, p.cy - 7], [p.cx - w / 2, p.cy - p.r - 16], [p.cx - w / 2, p.cy + p.r + 3]];
      const hit = cands.find(([l, t]) => l >= L && l + w <= R && t >= T && t + h <= B && !boxes.some((b) => l < b.l + b.w && l + w > b.l && t < b.t + b.h && t + h > b.t));
      if (!hit) return;
      boxes.push({ l: hit[0], t: hit[1], w, h });
      out.push({ l: hit[0], t: hit[1], text, kind }); // kind: strong (searched / picked) · mine · muted (extreme) · team
    });
    return out;
  }

  function view(c) {
    const s = c.state, set = (o) => c.setState(o), cat = c._cat;
    if (s.err) return { hasErr: true, err: s.err };
    if (!s.booted) return { loading: true };

    const entity = s.entity || 'player', isP = entity === 'player';
    const presets = PRESETS[entity];
    const def = isP ? presets[0] : presets[1];
    const pos = isP ? (s.pos || def.pos) : null;
    const xk = s.x || def.x, yk = s.y || def.y, third = s.size || s.colour || null;
    const X = cat.get(xk), Y = cat.get(yk);
    const perGame = s.per !== false;

    // Axis pickers: catalogue metrics for this entity (and position), grouped by family; stored-tier metrics excluded.
    const usable = [...cat.values()].filter((m) => m.entity === entity && m.tier !== 'stored' && m.direction !== 'neutral' &&
      (!isP || m.positions === 'all' || m.positions.includes(pos)));
    const fams = FAMILIES.map(([f, label]) => ({ label, opts: usable.filter((m) => m.family === f).map((m) => ({ value: m.id, label: m.label + (m.direction === 'lower' ? ' ↓' : '') })) })).filter((g) => g.opts.length);

    const base = {
      loading: false, isPlayers: isP, fams, xk, yk, size: s.size || '', colour: s.colour || '',
      modes: [['player', 'Players'], ['team', 'Teams']].map(([id, label]) => ({ label, on: id === entity, off: id !== entity, pick: () => set({ entity: id, x: null, y: null, size: null, colour: null, picks: [], hov: null, q: '' }) })),
      poss: POS.map((p) => ({ label: p, on: p === pos, off: p !== pos, pick: () => set({ pos: p, x: null, y: null, picks: [] }) })),
      presets: presets.map((p) => { const on = p.x === xk && p.y === yk; return { label: p.label, on, off: !on, pick: () => set({ x: p.x, y: p.y, pos: p.pos || s.pos }) }; }),
      onX: (e) => set({ x: e.target.value, y: yk }), onY: (e) => set({ y: e.target.value, x: xk }), onSwap: () => set({ x: yk, y: xk }),
      onSize: (e) => set({ size: e.target.value || null }), onColour: (e) => set({ colour: e.target.value || null }),
      qual: s.qualOnly !== false, onQual: () => set({ qualOnly: s.qualOnly === false }),
      mineOn: s.showMine !== false, onMine: () => set({ showMine: s.showMine === false }),
      q: s.q || '', onQ: (e) => set({ q: e.target.value }),
    };

    if (unpublished(X, s.season, s.season) || unpublished(Y, s.season, s.season)) {
      const m = unpublished(X, s.season, s.season) ? X : Y;
      return { ...base, isUnpublished: true, unpublishedNote: m.lastSeason === 'prior' ? `${m.label} is not published for ${s.season} yet.` : `${m.label} starts in ${m.firstSeason}.` };
    }

    load(c, {
      entity, metrics: [xk, yk].concat(third && third !== xk && third !== yk ? [third] : []),
      scope: { seasons: [s.season], weeks: [s.wFrom, s.wTo], positions: isP ? [pos] : undefined, teams: s.team ? [s.team] : undefined },
      transform: perGame ? 'perGame' : 'raw', limit: 1000,
    });
    if (!s.rows) return { ...base, loading: true };

    const qualOnly = s.qualOnly !== false;
    const rows = s.rows.filter((r) => r.values[xk].value != null && r.values[yk].value != null && (!qualOnly || (r.values[xk].qualified && r.values[yk].qualified)));
    if (rows.length < MIN_DOTS) {
      const all = s.rows.filter((r) => r.values[xk].value != null && r.values[yk].value != null).length;
      return { ...base, isFew: true, fewTitle: 'Too few qualifiers to chart', fewNote: `${rows.length} ${isP ? pos + 's' : 'teams'} qualify in weeks ${s.wFrom}–${s.wTo}. A scatter needs at least ${MIN_DOTS}.`, widen: () => set({ wFrom: 1, wTo: s.lastWeek }), showAll: all > rows.length ? () => set({ qualOnly: false }) : null, allCount: all };
    }

    // Scales. A lower-is-better axis runs reversed so up and right is always better.
    const PW = PLOT.W - PLOT.L - PLOT.R, PH = PLOT.H - PLOT.T - PLOT.B;
    const xs = rows.map((r) => r.values[xk].value), ys = rows.map((r) => r.values[yk].value);
    const dom = (a) => { const lo = Math.min(...a), hi = Math.max(...a), pd = (hi - lo) * 0.07 || 1; return [lo - pd, hi + pd]; };
    const [x0, x1] = dom(xs), [y0, y1] = dom(ys);
    const sx = (v) => { let t = (v - x0) / (x1 - x0); if (X.direction === 'lower') t = 1 - t; return PLOT.L + t * PW; };
    const sy = (v) => { let t = (v - y0) / (y1 - y0); if (Y.direction === 'lower') t = 1 - t; return PLOT.T + (1 - t) * PH; };
    const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
    const mx = mean(xs), my = mean(ys); // quadrant lines: the mean of the plotted (qualified) rows

    const q = (s.q || '').trim().toLowerCase();
    const picks = (s.picks || []).filter((id) => rows.some((r) => r.id === id));
    const mine = isP && s.showMine !== false ? s.mine : new Set();
    const pts = rows.map((r) => {
      const p = { r: 0, row: r, cx: sx(r.values[xk].value), cy: sy(r.values[yk].value) };
      p.r = s.size ? 3.5 + 6.5 * ((r.values[s.size].percentile ?? 50) / 100) : isP ? 5 : 6.5;
      p.matched = q.length > 1 && (r.name.toLowerCase().includes(q) || r.id.toLowerCase() === q);
      p.mine = mine.has(r.id);
      p.pick = picks.indexOf(r.id); // 0–2 → ring in --s1/2/3
      p.hov = r.id === s.hov;
      p.special = p.matched || p.mine || p.pick >= 0 || p.hov;
      // Fill: --accent at 0.5 (players) / 0.62 (teams) opacity; colour-by → heatColor(percentile) at 0.9; special dots opaque.
      p.fill = s.colour ? { heat: (r.values[s.colour].percentile ?? 50) / 100 } : 'accent';
      p.ring = p.pick >= 0 ? 's' + (p.pick + 1) : p.hov ? 'accent' : p.matched ? 'fg' : p.mine ? 'fantasy' : 'none';
      p.click = (ev) => {
        if (ev && ev.shiftKey) { // shift-click (or lasso) picks up to 3 for Compare
          const n = picks.slice(), at = n.indexOf(r.id);
          if (at >= 0) n.splice(at, 1); else if (n.length < 3) n.push(r.id);
          set({ picks: n });
        } else c.props.onNav && c.props.onNav(isP ? 'player' : 'team', { id: r.id }); // click opens the dashboard
      };
      p.enter = () => set({ hov: r.id });
      return p;
    });

    const short = (r) => (isP ? r.name.replace(/^(\S)\S*\s/, '$1. ') : r.id);
    const order = [];
    pts.filter((p) => p.matched || p.pick >= 0).forEach((p) => order.push({ p, text: short(p.row), kind: 'strong' }));
    pts.filter((p) => p.mine && !p.matched && p.pick < 0).forEach((p) => order.push({ p, text: short(p.row), kind: 'mine' }));
    if (isP) pts.filter((p) => !p.special).map((p) => ({ p, k: Math.abs((p.cx - PLOT.L) / PW - 0.5) + Math.abs((p.cy - PLOT.T) / PH - 0.5) })).sort((a, b) => b.k - a.k).slice(0, EXTREME_LABELS).forEach((o) => order.push({ p: o.p, text: short(o.p.row), kind: 'muted' }));
    else pts.filter((p) => !(p.matched || p.pick >= 0)).forEach((p) => order.push({ p, text: p.row.id, kind: 'team' }));

    // r as plotted: both axes oriented so positive means "better on both".
    const ox = xs.map((v) => (X.direction === 'lower' ? -v : v)), oy = ys.map((v) => (Y.direction === 'lower' ? -v : v));
    const ax = mean(ox), ay = mean(oy);
    let sxy = 0, sxx = 0, syy = 0;
    ox.forEach((v, i) => { sxy += (v - ax) * (oy[i] - ay); sxx += (v - ax) ** 2; syy += (oy[i] - ay) ** 2; });
    const r = sxy / Math.sqrt(sxx * syy);

    const [xg, xb] = words(X), [yg, yb] = words(Y);
    const hp = pts.find((p) => p.hov);
    const sort = s.sort || { k: 'y', dir: 1 };
    const keyOf = { x: xk, y: yk, t: third };
    const sorted = rows.slice().sort((a, b) => (sort.k === 'name' ? sort.dir * a.name.localeCompare(b.name) : sort.dir * ((b.values[keyOf[sort.k]].percentile ?? -1) - (a.values[keyOf[sort.k]].percentile ?? -1))));
    const fmt = (m, v) => window.StatsModel.fmtMetric(m, v); // unit + decimals from the catalogue (pct → "24.1%", epa → "+0.12")

    return {
      ...base, isReady: true,
      title: `${Y.label} vs ${X.label.charAt(0).toLowerCase() + X.label.slice(1)}`,
      subtitle: `${isP ? pos + 's' : 'Teams'} · ${s.season} · weeks ${s.wFrom}–${s.wTo} · ${perGame ? 'per game' : 'totals'}`,
      xLabel: X.label + (X.direction === 'lower' ? ' ↓' : ''), yLabel: Y.label + (Y.direction === 'lower' ? ' ↓' : ''),
      xTicks: ticks(x0, x1, 7).map((v) => ({ x: sx(v), label: fmt(X, v) })), yTicks: ticks(y0, y1, 6).map((v) => ({ y: sy(v), label: fmt(Y, v) })),
      quad: { x: sx(mx), y: sy(my) },
      corners: { tr: cap(xg + ', ' + yg), tl: cap(xb + ', ' + yg), br: cap(xg + ', ' + yb), bl: cap(xb + ', ' + yb) },
      dots: pts.filter((p) => !p.special).concat(pts.filter((p) => p.special)), // special dots paint last
      labels: placeLabels(order, isP ? 6.3 : 6.6),
      hov: hp ? {
        name: hp.row.name, sub: isP ? `${hp.row.team} · ${pos}` : `${hp.row.id} · ${hp.row.games} G`, flip: hp.cx > PLOT.L + PW * 0.6,
        rows: [X, Y].concat(third && third !== xk && third !== yk ? [cat.get(third)] : []).map((m) => ({ label: m.label, text: fmt(m, hp.row.values[m.id].value), ...chip(hp.row.values[m.id].percentile) })),
        sample: `${hp.row.games} G · ${hp.row.values[yk].sample} ${Y.sampleLabel}`,
      } : null,
      picks: picks.map((id, i) => ({ series: 's' + (i + 1), label: short(rows.find((x) => x.id === id)) })),
      compare: picks.length ? () => c.props.onNav && c.props.onNav('compare', { entity, ids: picks, pos }) : null,
      clearPicks: () => set({ picks: [] }),
      rText: (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(2), n: rows.length, nNote: isP ? `qualified ${pos}s shown` : 'teams',
      meanNote: `Dashed lines: qualified mean, ${fmt(X, mx)} and ${fmt(Y, my)}`,
      notes: s.notes || [], // engine caveats, e.g. "Routes in 2026 are estimated" → shown under the table
      cols: [['name', isP ? 'Player' : 'Team'], ['team', isP ? 'Team' : ''], ['x', X.label], ['y', Y.label], ['t', third ? cat.get(third).label : '']].map(([k, label]) => ({
        label, sorted: sort.k === k, arrow: sort.k === k ? (sort.dir === 1 ? '↓' : '↑') : '',
        pick: k === 'team' || (k === 't' && !third) ? null : () => set({ sort: { k, dir: sort.k === k ? -sort.dir : 1 } }),
      })),
      rows: sorted.map((row, i) => ({
        rank: i + 1, name: row.name, team: row.team, mine: mine.has(row.id), matched: q.length > 1 && row.name.toLowerCase().includes(q),
        estimated: [xk, yk].some((k) => row.values[k].estimated), // "est." after the value
        cells: [xk, yk].concat(third ? [third] : []).map((k) => ({ text: fmt(cat.get(k), row.values[k].value), ...chip(row.values[k].percentile) })),
      })),
    };
  }

  function safeView(c) {
    try { return view(c); } catch (e) { console.error('StatsExplore.view', e); return { hasErr: true, err: msg(e) }; }
  }

  window.StatsExplore = { init, view: safeView, _x: { PRESETS, WORDS, MIN_DOTS, placeLabels, unpublished } };
})();
