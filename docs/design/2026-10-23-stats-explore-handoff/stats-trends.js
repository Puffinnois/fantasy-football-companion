// Explore › Trends — view-model spec for multi-season trends (README §14).
// Mockups: Trends.dc.html (WR with a team change and a non-qualified season), TrendsTeamDark.dc.html (a team),
// TrendsOneSeason.dc.html (one season only). Data: window.api.stats.catalogue(), .query(), .player({ id }) for the bio.
// Seed: { entity, id, metric } from a dashboard stat line's trend icon; otherwise the last entity viewed.
(() => {
  const msg = (e) => String((e && e.message) || e);
  const FIRST_SEASON = 2019; // the warehouse starts here (spec §4); a metric may start later (firstSeason)
  // "Career at a glance": six core metrics per position (all core tier in catalogue.ts).
  const CORE = {
    QB: ['qb_epa_db', 'qb_success', 'cpoe', 'pass_adot', 'sack_rate', 'fantasy_ppg'],
    RB: ['carry_share', 'snap_share', 'rush_ypc', 'target_share', 'expected_points', 'fantasy_ppg'],
    WR: ['target_share', 'air_yards_share', 'yprr', 'separation', 'route_participation', 'fantasy_ppg'],
    TE: ['target_share', 'route_participation', 'yprr', 'separation', 'snap_share', 'fantasy_ppg'],
    team: ['off_epa_play', 'off_success_rate', 'off_explosive_rate', 'off_pass_epa', 'off_rush_epa', 'td_drive_rate'],
  };
  const MAX_SERIES = 3; // the entity plus two comparisons: --s1 circle, --s2 square, --s3 diamond
  const PLOT = { W: 892, H: 300, L: 52, R: 20, T: 30, B: 54 }; // B fits season · age · team-change chip

  function init(c) {
    Promise.all([window.api.stats.catalogue(), window.api.stats.status()])
      .then(([cat, status]) => {
        if (!c._alive) return;
        c._cat = new Map(cat.map((m) => [m.id, m]));
        c.setState({ now: status.through ? status.through.season : new Date().getFullYear(), throughWeek: status.through ? status.through.week : null, booted: true });
      })
      .catch((e) => c._alive && c.setState({ err: msg(e) }));
  }

  // Three queries per (entity, ids, metric): the series rows, the position's qualified distribution per season,
  // and (players) the bio for age and experience. The distribution query asks for every qualified row at the
  // position grouped by season and computes p25 / median / p75 here: no new engine endpoint needed.
  function load(c, k) {
    const key = JSON.stringify(k);
    if (c._key === key) return;
    c._key = key;
    c.setState({ series: null, dist: null });
    const seasons = []; for (let y = FIRST_SEASON; y <= c.state.now; y++) seasons.push(y);
    const scope = { seasons, seasonType: k.seasonType };
    const transform = k.perGame ? 'perGame' : 'raw';
    const isP = k.entity === 'player';
    Promise.all([
      window.api.stats.query({ entity: k.entity, metrics: [k.metric], scope: { ...scope, [isP ? 'players' : 'teams']: k.ids }, groupBy: isP ? ['season', 'team'] : ['season'], transform, limit: 1000 }),
      window.api.stats.query({ entity: k.entity, metrics: [k.metric], scope: { ...scope, positions: isP ? [k.pos] : undefined, qualifiedOnly: true }, groupBy: ['season'], transform, limit: 1000 }),
      isP ? window.api.stats.player({ id: k.ids[0] }) : Promise.resolve(null),
      // Glance: the six core metrics for the main entity only, one row per season.
      window.api.stats.query({ entity: k.entity, metrics: CORE[isP ? k.pos : 'team'], scope: { ...scope, [isP ? 'players' : 'teams']: [k.ids[0]] }, groupBy: ['season'], transform, limit: 100 }),
    ]).then(([series, dist, bio, glance]) => {
      if (!c._alive || c._key !== key) return;
      c.setState({ series: series.rows, dist: dist.rows, bio, glance: glance.rows, notes: series.notes });
    }).catch((e) => c._alive && c._key === key && c.setState({ err: msg(e) }));
  }

  const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const chip = (v) => (!v || v.percentile == null ? { pct: '—', tone: 'none' } : !v.qualified ? { pct: 'NQ', tone: 'outline' } : { pct: Math.round(v.percentile), tone: v.percentile >= 75 ? 'good' : v.percentile <= 25 ? 'bad' : 'mid' });
  const path = (pts) => { let d = '', pen = false; pts.forEach((p) => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; }); return d; };

  function view(c) {
    const s = c.state, set = (o) => c.setState(o), cat = c._cat;
    if (s.err) return { hasErr: true, err: s.err };
    if (!s.booted || !s.id) return { loading: !!s.id, needsPick: !s.id };

    const entity = s.entity || 'player', isP = entity === 'player';
    const pos = isP ? s.pos : null;
    const metric = s.metric || CORE[isP ? pos : 'team'][2];
    const M = cat.get(metric);
    const ids = [s.id].concat((s.cmp || []).slice(0, MAX_SERIES - 1));
    load(c, { entity, ids, metric, pos, perGame: s.per !== false, seasonType: s.seasonType || 'REG' });
    if (!s.series) return { loading: true };

    const fmt = (v) => window.StatsModel.fmtMetric(M, v);
    // The main entity's seasons: from its first row to now. Players can have two rows in a season (traded
    // mid-season); the season row is the sum, and the team cell reads "BRK → HAR".
    const mine = s.series.filter((r) => r.id === s.id);
    const bySeason = new Map();
    mine.forEach((r) => { const y = +r.group.season, cur = bySeason.get(y); bySeason.set(y, cur ? { ...cur, teams: cur.teams.concat(r.team), merged: true } : { row: r, teams: [r.team] }); });
    // Mid-season trades: re-query without groupBy team for the merged seasons' values (left to the implementation;
    // the mock has none). Here the first row stands in.
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);
    const metricFrom = Math.max(M.firstSeason, FIRST_SEASON);
    const publishedTo = M.lastSeason === 'prior' ? s.now - 1 : s.now;

    const who = isP ? {
      chip: pos, name: s.bio ? s.bio.name : mine[0].name, team: mine[mine.length - 1].team,
      meta: s.bio ? `age ${s.bio.age} · ${ord(seasons.length)} season` + (new Set(mine.map((r) => r.team)).size > 1 ? ' · ' + teamRuns(mine) : '') : '',
    } : { chip: s.id, name: mine[0].name, team: s.id, meta: `${seasons[0]}–${seasons[seasons.length - 1]}` };

    // States.
    if (seasons.length < 2) return { who, isOne: true, oneTitle: isP ? 'Trends need two seasons; he has one.' : 'Trends need two seasons.', oneNote: oneLine(M, bySeason.get(seasons[0]), fmt) };
    const startNote = metricFrom > seasons[0] ? (M.family === 'charting' ? `Charted from ${metricFrom}.` : M.family === 'ngs' ? `Next Gen Stats from ${metricFrom}.` : `From ${metricFrom}.`) : '';
    const endNote = publishedTo < seasons[seasons.length - 1] ? `Not published for ${s.now} yet.` : '';
    const estNote = mine.some((r) => r.values[metric].estimated) ? (s.notes || []).find((n) => /estimat/i.test(n)) || 'Current season estimated.' : '';

    // Distribution per season: p25 / median / p75 of the qualified rows at the position.
    const dist = new Map();
    seasons.forEach((y) => { const vs = s.dist.filter((r) => +r.group.season === y).map((r) => r.values[metric].value).filter((v) => v != null); dist.set(y, { p25: quantile(vs, 0.25), p50: quantile(vs, 0.5), p75: quantile(vs, 0.75), n: vs.length }); });

    // Scales: seasons evenly spaced; lower-is-better metrics flip so up is better (axis label gets ↓).
    const PW = PLOT.W - PLOT.L - PLOT.R, PH = PLOT.H - PLOT.T - PLOT.B, n = seasons.length;
    const xAt = (i) => PLOT.L + (PW * (i + 0.5)) / n;
    const val = (y, id) => { const r = s.series.find((x) => x.id === id && +x.group.season === y); return r ? r.values[metric] : null; };
    const all = [];
    seasons.forEach((y) => { ids.forEach((id) => { const v = val(y, id); if (v && v.value != null) all.push(v.value); }); const d = dist.get(y); [d.p25, d.p75].forEach((v) => v != null && all.push(v)); });
    const lo = Math.min(...all), hi = Math.max(...all), pd = (hi - lo) * 0.12, y0 = lo - pd, y1 = hi + pd;
    const yAt = (v) => { let t = (v - y0) / (y1 - y0); if (M.direction === 'lower') t = 1 - t; return PLOT.T + (1 - t) * PH; };

    const series = ids.map((id, k) => ({
      key: id, series: 's' + (k + 1), shape: ['circle', 'square', 'diamond'][k],
      d: path(seasons.map((y, i) => { const v = val(y, id); return v && v.value != null ? [xAt(i), yAt(v.value)] : null; })),
      // Hollow dot when the season did not qualify (main entity only; comparisons are drawn as context).
      dots: seasons.map((y, i) => { const v = val(y, id); return v && v.value != null ? { x: xAt(i), y: yAt(v.value), hollow: k === 0 && !v.qualified } : null; }).filter(Boolean),
      label: k === 0 ? who.name : (s.series.find((r) => r.id === id) || {}).name,
      remove: k === 0 ? null : () => set({ cmp: (s.cmp || []).filter((x) => x !== id) }),
    }));
    const band = seasons.map((y, i) => dist.get(y)).every((d) => d.p25 != null)
      ? path(seasons.map((y, i) => [xAt(i), yAt(dist.get(y).p75)])) + path(seasons.map((y, i) => [xAt(i), yAt(dist.get(y).p25)]).reverse()).replace(/^M/, 'L') + 'Z' : '';
    const median = path(seasons.map((y, i) => (dist.get(y).p50 == null ? null : [xAt(i), yAt(dist.get(y).p50)])));
    // Age curve: needs typical value by age at the position. Not served today: add groupBy 'age' to the engine
    // (age at season start from the bio table), or ship a precomputed curve with the models. Hidden until then.
    const ageCurve = isP && s.age !== false && s.ageCurve ? path(seasons.map((y, i) => { const a = s.bio.ageAt(y), v = s.ageCurve[a]; return v == null ? null : [xAt(i), yAt(v)]; })) : '';

    const hs = s.hs != null ? s.hs : n - 2; // hover a full season by default, not the partial current one
    const axis = seasons.map((y, i) => {
      const b = bySeason.get(y), prev = i > 0 ? bySeason.get(seasons[i - 1]) : null;
      return { x: xAt(i), season: y, age: isP && s.bio ? s.bio.ageAt(y) : null, team: isP && (!prev || prev.teams[prev.teams.length - 1] !== b.teams[0]) ? b.teams.join(' → ') : null, enter: () => set({ hs: i }) };
    });
    const tipV = val(seasons[hs], s.id);
    const tip = tipV && tipV.value != null ? {
      x: xAt(hs), y: yAt(tipV.value), flip: xAt(hs) > PLOT.L + PW * 0.62,
      season: seasons[hs] + (seasons[hs] === s.now && s.throughWeek ? ` · through wk ${s.throughWeek}` : ''),
      team: isP ? bySeason.get(seasons[hs]).teams.join(' → ') : '', value: fmt(tipV.value), ...chip(tipV),
      rank: tipV.qualified ? `${ord(tipV.rank)} of ${dist.get(seasons[hs]).n} qualified ${isP ? pos + 's' : 'teams'} · ${ord(Math.round(tipV.percentile))} percentile` : `Not qualified: ${tipV.sample} ${M.sampleLabel}, below the minimum`,
      sample: `${bySeason.get(seasons[hs]).row.games} G · ${tipV.sample} ${M.sampleLabel}`,
    } : null;

    // Table, newest first. Δ vs prior season is toned by the metric's better side.
    const rows = seasons.map((y, i) => {
      const v = val(y, s.id), p = i > 0 ? val(seasons[i - 1], s.id) : null, b = bySeason.get(y);
      const d = v && p && v.value != null && p.value != null ? v.value - p.value : null;
      const better = d == null || Math.abs(d) < 1e-9 ? 'none' : (d > 0) === (M.direction !== 'lower') ? 'good' : 'bad';
      return {
        season: y, team: isP ? b.teams.join(' → ') : b.row.group.record || '', age: isP && s.bio ? s.bio.ageAt(y) : null, g: b.row.games,
        value: v && v.value != null ? fmt(v.value) + (v.estimated ? ' est.' : '') : y < metricFrom ? 'not charted' : 'not published',
        delta: d == null ? '—' : window.StatsModel.fmtDelta(M, d), deltaTone: better,
        ...chip(v), rank: v && v.qualified ? `${ord(v.rank)} of ${dist.get(y).n}` : '—',
        sample: v ? (v.qualified ? '' : 'Not qualified · ') + `${v.sample} ${M.sampleLabel}` : '', muted: !v || !v.qualified, hovered: i === hs,
      };
    }).reverse();

    // Career at a glance: per core metric, a sparkline of percentile by season (dotted line = 50th), last value + chip.
    const glance = CORE[isP ? pos : 'team'].map((id) => {
      const m = cat.get(id), gs = s.glance.filter((r) => r.values[id]).sort((a, b) => a.group.season - b.group.season);
      const last = [...gs].reverse().find((r) => r.values[id].value != null);
      const m0 = Math.max(m.firstSeason, seasons[0]), pTo = m.lastSeason === 'prior' ? s.now - 1 : s.now;
      return {
        id, label: m.label, on: id === metric, pick: () => set({ metric: id }),
        value: last ? window.StatsModel.fmtMetric(m, last.values[id].value) + (last.group.season !== s.now ? ` (${last.group.season})` : '') : '—', ...chip(last && last.values[id]),
        spark: gs.map((r) => r.values[id].percentile), // 112 × 34 sparkline, y = percentile
        note: m0 > seasons[0] ? (m.family === 'charting' ? `Charted from ${m0}.` : `From ${m0}.`) : pTo < s.now ? `Not published for ${s.now} yet.` : '',
      };
    });

    return {
      isMulti: true, who, isPlayer: isP, metric, mLabel: M.label + (M.direction === 'lower' ? ' ↓' : ''),
      posLabel: isP ? pos : 'team', startNote, endNote, estNote,
      yTicks: window.StatsModel.ticks(y0, y1, 5).map((v) => ({ y: yAt(v), label: fmt(v) })),
      series, band, median, ageCurve, showAge: !!ageCurve, axis, tip, rows, glance,
      ageOn: s.age !== false, onAge: () => set({ age: s.age === false }),
      canAdd: ids.length < MAX_SERIES, onAdd: () => set({ adding: true }), // opens the same search as the toolbar, scoped to the position
      onMetric: (e) => set({ metric: e.target.value }),
    };
  }

  // "BRK 2021–23, HAR since 2024"
  function teamRuns(rows) {
    const runs = [];
    rows.slice().sort((a, b) => a.group.season - b.group.season).forEach((r) => { const y = +r.group.season, last = runs[runs.length - 1]; if (last && last.team === r.team) last.to = y; else runs.push({ team: r.team, from: y, to: y }); });
    return runs.map((r, i) => (i === runs.length - 1 && runs.length > 1 ? `${r.team} since ${r.from}` : `${r.team} ${r.from}${r.to > r.from ? '–' + String(r.to).slice(2) : ''}`)).join(', ');
  }

  function oneLine(M, b, fmt) {
    const v = b && b.row.values[M.id];
    if (!v || v.value == null) return 'Trends start once a second season is on the books.';
    return `${b.row.group.season} so far: ${fmt(v.value)} ${M.label.toLowerCase()}` + (v.qualified ? `, ${ord(Math.round(v.percentile))} percentile (${ord(v.rank)}).` : ', not yet qualified.') + ' Trends start once a second season is on the books.';
  }

  function safeView(c) {
    try { return view(c); } catch (e) { console.error('StatsTrends.view', e); return { hasErr: true, err: msg(e) }; }
  }

  window.StatsTrends = { init, view: safeView, _x: { CORE, quantile, teamRuns } };
})();
