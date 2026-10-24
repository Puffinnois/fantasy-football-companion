// Explore › Compare › Teams — view-model spec, an addition to stats-compare.js (README §7, amended).
// Mockups: CompareTeams.dc.html (three teams), CompareTeamsDark.dc.html, CompareTeamsOpen.dc.html (two + open slot).
// The players view in stats-compare.js stays as it is; a Players / Teams control picks the view. This file's
// teamView(c) is what view(c) returns when state.entity === 'team'. Data: window.api.stats.query / catalogue / status.
(() => {
  const msg = (e) => String((e && e.message) || e);
  // Metric rows, by group. Ids are catalogue.ts ids; every one is `entity: 'team'`. Direction comes from the
  // catalogue, so a defensive "allowed" metric is better when lower and its percentile already reflects that.
  // The catalogue has no red-zone TD rate for teams yet: touchdown drive rate and points per drive stand in.
  const GROUPS = [
    ['Offense', ['off_epa_play', 'off_success_rate', 'off_explosive_rate', 'off_pass_epa', 'off_rush_epa', 'off_sack_rate']],
    ['Defense', ['def_epa_play', 'def_success_rate', 'def_explosive_rate', 'def_pressure_rate', 'def_sack_rate']],
    ['Special teams', ['team_fgoe', 'team_punt_net_avg']],
    ['Situational', ['off_third_down_pct', 'td_drive_rate', 'def_third_down_pct', 'def_points_per_drive']],
  ];
  // Row sub-labels: the catalogue labels already say "allowed"; the sub-label carries the unit instead.
  const SUB = { team_fgoe: 'season', team_punt_net_avg: 'yd' };
  const SLOTS = 3;
  const CHART = { W: 1216, H: 230, L: 56, R: 24, T: 30, B: 32 };
  const WEEKLY = { off: 'off_epa_play', def: 'def_epa_play' }; // chart toggle: Offense / Defense

  // Seed from the team dashboard's Compare button: that team, then the two teams nearest in Elo.
  function seedTeams(teamId, eloRows) {
    const me = eloRows.find((r) => r.id === teamId);
    if (!me) return [teamId, null, null];
    const e = me.values.elo.value;
    const near = eloRows.filter((r) => r.id !== teamId && r.values.elo.value != null).sort((a, b) => Math.abs(a.values.elo.value - e) - Math.abs(b.values.elo.value - e));
    return [teamId].concat(near.slice(0, 2).map((r) => r.id));
  }
  // No seed: the top three by Elo. My fantasy team's NFL team is not special here.
  const defaultTeams = (eloRows) => eloRows.slice().sort((a, b) => b.values.elo.value - a.values.elo.value).slice(0, SLOTS).map((r) => r.id);

  // Two queries per (season, weeks, per): every team on every row metric plus elo / wins / losses (cards), and
  // the same two weekly metrics grouped by week (chart). The league median per week comes from the second.
  function load(c, k) {
    const key = JSON.stringify(k);
    if (c._tkey === key) return;
    c._tkey = key;
    c.setState({ tRows: null, tWeeks: null });
    const scope = { seasons: [k.season], weeks: [k.wFrom, k.wTo] };
    Promise.all([
      window.api.stats.query({ entity: 'team', metrics: GROUPS.flatMap((g) => g[1]).concat(['elo', 'wins', 'losses']), scope, transform: k.perGame ? 'perGame' : 'raw', limit: 32 }),
      window.api.stats.query({ entity: 'team', metrics: [WEEKLY.off, WEEKLY.def], scope, groupBy: ['week'], limit: 1000 }),
    ]).then(([rows, weeks]) => {
      if (!c._alive || c._tkey !== key) return;
      const ids = c.state.tIds || (c.state.seedTeam ? seedTeams(c.state.seedTeam, rows.rows) : defaultTeams(rows.rows));
      c.setState({ tRows: rows.rows, tWeeks: weeks.rows, tIds: ids });
    }).catch((e) => c._alive && c._tkey === key && c.setState({ err: msg(e) }));
  }

  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const med = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const path = (pts) => { let d = '', pen = false; pts.forEach((p) => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; }); return d; };

  function teamView(c, base) {
    const s = c.state, set = (o) => c.setState(o), cat = c._cat;
    load(c, { season: s.season, wFrom: s.wFrom, wTo: s.wTo, perGame: s.per !== false });
    if (!s.tRows) return { ...base, loading: true };

    const byId = new Map(s.tRows.map((r) => [r.id, r]));
    const ids = (s.tIds || []).concat([null, null, null]).slice(0, SLOTS);
    const teams = ids.map((id) => (id ? byId.get(id) : null));
    const filled = teams.filter(Boolean).length;
    const flat = GROUPS.flatMap((g) => g[1]).filter((m) => !(cat.get(m).lastSeason === 'prior' && s.season >= s.now));
    // Leads: rows where this team has the best percentile among the filled slots (ties count for both).
    const leads = teams.map((t) => (t && filled > 1 ? flat.filter((m) => { const p = t.values[m].percentile; return p != null && teams.every((o) => !o || (o.values[m].percentile ?? -1) <= p); }).length : 0));
    const setSlot = (k, v) => { const n = ids.slice(); n[k] = v || null; set({ tIds: n }); };
    const fmt = (m, v) => window.StatsModel.fmtMetric(cat.get(m), v);

    const slots = ids.map((id, k) => {
      const series = 's' + (k + 1), shape = ['circle', 'square', 'diamond'][k];
      const t = teams[k];
      if (!t) return { empty: true, series, shape, onPick: (e) => setSlot(k, e.target.value), hint: k === 2 && ids[0] ? `Tip: ${nearestHint(ids[0], ids, s.tRows)}` : '' };
      const info = window.StatsModel.teamInfo(id); // { name, division } from nflTeams.ts
      return {
        full: true, series, shape, abbr: id, name: info.name,
        record: `${t.values.wins.value}–${t.values.losses.value}`, div: divisionPlace(id, s.tRows), elo: Math.round(t.values.elo.value).toLocaleString('en-US'),
        leads: filled > 1 ? `Leads ${leads[k]} of ${flat.length}` : '',
        v: id, onPick: (e) => setSlot(k, e.target.value), onRemove: () => setSlot(k, null),
      };
    });
    // Swap select: all 32, alphabetical by abbreviation, "HAR · Harbor City Pilots"; teams already in a slot disabled.
    const teamOpts = [...byId.keys()].sort().map((id) => ({ value: id, label: `${id} · ${window.StatsModel.teamInfo(id).name}`, disabled: ids.includes(id) }));

    const groups = GROUPS.map(([label, ms]) => ({
      label,
      rows: ms.map((m) => {
        const M = cat.get(m);
        const best = Math.max(...teams.filter(Boolean).map((t) => t.values[m].percentile ?? -1));
        // Participation metrics (def_pressure_rate: `lastSeason: 'prior'`) have no current-season value: the row
        // stays, its cells read "Not published for 2026 yet." in --fg-3, and it does not count toward Leads.
        const unpublished = M.lastSeason === 'prior' && s.season >= s.now;
        return {
          label: M.label, sub: SUB[m] || '', lowerBetter: M.direction === 'lower', unpublished,
          unpublishedNote: unpublished ? `Not published for ${s.season} yet.` : '',
          cells: teams.map((t) => {
            if (!t || unpublished) return { empty: true };
            const v = t.values[m];
            return {
              full: true, text: fmt(m, v.value), lead: filled > 1 && v.percentile === best,
              n: v.percentile == null ? null : Math.round(v.percentile), // pill-dot bar, heatColor(n / 100)
              rank: v.rank != null ? '#' + v.rank : '',
              tip: v.percentile == null ? '' : `${ord(Math.round(v.percentile))} percentile · ${ord(v.rank)} of 32` + (M.direction === 'lower' ? ' · lower is better' : ''),
            };
          }),
        };
      }),
    }));

    // Weekly chart. Defense flips so up is better; the axis label says "↓". Gaps are byes.
    const side = s.tSide || 'off', metric = WEEKLY[side], M = cat.get(metric), flip = M.direction === 'lower';
    const weeks = []; for (let w = s.wFrom; w <= s.wTo; w++) weeks.push(w);
    const wv = (id, w) => { const r = s.tWeeks.find((x) => x.id === id && +x.group.week === w); return r ? r.values[metric].value : null; };
    const medians = weeks.map((w) => med(s.tWeeks.filter((r) => +r.group.week === w).map((r) => r.values[metric].value)));
    const lines = ids.map((id, k) => (id ? { series: 's' + (k + 1), shape: ['circle', 'square', 'diamond'][k], abbr: id, pts: weeks.map((w) => wv(id, w)) } : null)).filter(Boolean);
    const all = lines.flatMap((l) => l.pts).concat(medians).filter((v) => v != null);
    const lo = Math.min(...all), hi = Math.max(...all), pd = (hi - lo) * 0.12 || 0.05, y0 = lo - pd, y1 = hi + pd;
    const PW = CHART.W - CHART.L - CHART.R, PH = CHART.H - CHART.T - CHART.B;
    const xAt = (i) => CHART.L + (PW * (i + 0.5)) / weeks.length;
    const yAt = (v) => { let t = (v - y0) / (y1 - y0); if (flip) t = 1 - t; return CHART.T + (1 - t) * PH; };

    return {
      ...base, ready: true, isTeams: true, slots, teamOpts, groups,
      poolNote: 'Percentiles vs all 32 teams. Allowed metrics rank lower as better. Best value in each row is bold.',
      sides: [['off', 'Offense'], ['def', 'Defense']].map(([id, label]) => ({ label, on: id === side, off: id !== side, pick: () => set({ tSide: id }) })),
      chartTitle: side === 'off' ? 'EPA per play by week · offense' : 'EPA per play allowed by week · defense',
      chartNote: flip ? 'Flipped so up is better · gaps are byes' : 'Gaps are byes',
      axisLabel: M.label + (flip ? ' ↓' : ''),
      yTicks: window.StatsModel.ticks(y0, y1, 5).map((v) => ({ y: yAt(v), label: fmt(metric, v) })),
      xTicks: weeks.map((w, i) => ({ x: xAt(i), label: 'Wk ' + w })),
      zero: y0 < 0 && y1 > 0 ? yAt(0) : null,
      median: path(medians.map((v, i) => (v == null ? null : [xAt(i), yAt(v)]))),
      lines: lines.map((l) => ({ ...l, d: path(l.pts.map((v, i) => (v == null ? null : [xAt(i), yAt(v)]))), marks: l.pts.map((v, i) => (v == null ? null : { x: xAt(i), y: yAt(v), tip: `${l.abbr} · week ${weeks[i]} · ${fmt(metric, v)}` })).filter(Boolean) })),
      legend: lines.map((l) => ({ series: l.series, shape: l.shape, abbr: l.abbr })),
    };
  }

  // "North 1st": place within the division by win %, then Elo.
  function divisionPlace(id, rows) {
    const T = window.StatsModel.teamInfo;
    const div = T(id).division;
    const mates = rows.filter((r) => T(r.id).division === div).sort((a, b) => (b.values.wins.value - b.values.losses.value) - (a.values.wins.value - a.values.losses.value) || b.values.elo.value - a.values.elo.value);
    return `${div} ${ord(mates.findIndex((r) => r.id === id) + 1)}`;
  }
  function nearestHint(id, ids, rows) {
    const near = seedTeams(id, rows).slice(1).filter((x) => !ids.includes(x));
    return near.length ? `${near.join(' and ')} ${near.length > 1 ? 'are' : 'is'} nearest in Elo to ${id}.` : '';
  }

  function safeTeamView(c, base) {
    try { return teamView(c, base); } catch (e) { console.error('StatsCompare.teamView', e); return { ...base, hasErr: true, err: msg(e) }; }
  }

  // Merged into window.StatsCompare: view(c) returns teamView(c, sharedToolbarVals) when state.entity === 'team'.
  window.StatsCompareTeams = { teamView: safeTeamView, _x: { GROUPS, seedTeams, defaultTeams, divisionPlace } };
})();
