import sys, numpy as np, pandas as pd
D = sys.argv[1]
ret = pd.read_csv(f'{D}/return_games.csv', dtype={'player_id': str})
sl = pd.concat([pd.read_csv(f'{D}/data/sleeper_{y}.csv', dtype={'player_id': str}) for y in range(2019, 2026)])
p = sl[sl.kind == 'proj'][['season', 'week', 'player_id', 'pts_ppr']].rename(columns={'pts_ppr': 'proj'})
s = sl[sl.kind == 'stat'][['season', 'week', 'player_id', 'pts_ppr', 'gp']].rename(columns={'pts_ppr': 'act'})
a = p.merge(s, on=['season', 'week', 'player_id'])
a = a[(a.gp.fillna(0) > 0) & (a.proj >= 10)]
pos = sl[sl.kind == 'proj'][['player_id']].drop_duplicates()
# (c) QB oddity: all games league-wide with proj >= 10, by season, ratio actual/proj -- position from return file is not enough, use roster
ros = pd.concat([pd.read_csv(f'{D}/data/roster_weekly_{y}.csv', usecols=['season', 'week', 'position', 'sleeper_id'], low_memory=False) for y in range(2019, 2026)]).dropna()
ros['player_id'] = ros.sleeper_id.astype('Int64').astype(str)
a = a.merge(ros.drop_duplicates(['season', 'week', 'player_id'])[['season', 'week', 'player_id', 'position']], on=['season', 'week', 'player_id'])
print('(c) league-wide actual/proj, proj>=10, by pos x season')
print(a.groupby(['position', 'season']).apply(lambda d: round(d.act.fillna(0).sum() / d.proj.sum(), 2), include_groups=False).unstack().to_string())
ctrl = {k: d.act.fillna(0).sum() / d.proj.sum() for k, d in a.groupby('position')}
# (a) per-season WR game 1 (effect vs league-wide same-season ratio)
cs = {k: d.act.fillna(0).sum() / d.proj.sum() for k, d in a.groupby(['position', 'season'])}
r1 = ret[ret.k == 1]
print('\n(a) game-1 effect by season (vs league-wide same pos/season, proj>=10 ratio)')
rows = []
for (ps, se), d in r1.groupby(['pos', 'season']):
    rows.append((ps, se, len(d), round(d.act.sum() / d.proj.sum() / cs[(ps, se)], 2)))
print(pd.DataFrame(rows, columns=['pos', 'season', 'n', 'eff']).pivot(index='pos', columns='season', values='eff').to_string())
# (b) points: mean (actual - proj) in return game k vs league-wide mean residual for similar projections
a['res'] = a.act.fillna(0) - a.proj
print('\n(b) mean residual (pts) return games vs league games with proj>=10, by pos x k (return games with proj>=10 only)')
lg = a.groupby('position').res.mean().round(2).to_dict()
rr = ret[ret.proj >= 10].assign(res=lambda d: d.act - d.proj)
print('league', lg)
print(rr.groupby(['pos', 'k']).res.agg(['count', 'mean']).round(2).unstack().to_string())
# (d) stricter relevance: base_proj >= 10
rng = np.random.default_rng(3)
def eff(d, c):
    x, y = d.act.to_numpy(), d.proj.to_numpy(); i = rng.integers(0, len(d), (2000, len(d)))
    b = x[i].sum(1) / y[i].sum(1) / c
    return len(d), round(x.sum() / y.sum() / c, 3), round(np.percentile(b, 2.5), 3), round(np.percentile(b, 97.5), 3)
print('\n(d) base_proj >= 10, effect vs league-wide proj>=10 ratio')
for (ps, k), d in ret[ret.base_proj >= 10].groupby(['pos', 'k']):
    print(ps, k, eff(d, ctrl[ps]))

# (e) games 1-2 pooled, same-player control from analyze.py, bootstrap by episode
import json
same = json.load(open(f'{D}/control_ratio.json'))
def eff_ep(d, c):
    e = d.groupby('eid')[['act', 'proj']].sum().to_numpy(); i = rng.integers(0, len(e), (4000, len(e)))
    b = e[i, 0].sum(1) / e[i, 1].sum(1) / c
    return f"eps={len(e)} games={len(d)} effect={e[:, 0].sum() / e[:, 1].sum() / c:.3f} [{np.percentile(b, 2.5):.3f}, {np.percentile(b, 97.5):.3f}]"
r = ret[ret.k <= 2].copy(); r['mb'] = pd.cut(r.missed, [0, 1, 3, 99], labels=['1', '2-3', '4+'])
print('\n(e) games 1-2 pooled')
for ps in ('QB', 'RB', 'TE', 'WR'): print(ps, eff_ep(r[r.pos == ps], same[ps]))
for mb, d in r[r.pos == 'WR'].groupby('mb', observed=True): print('WR missed', mb, eff_ep(d, same['WR']))
w = r[r.pos == 'WR']
print('WR 2019-22', eff_ep(w[w.season <= 2022], same['WR']), '| WR 2023-25', eff_ep(w[w.season >= 2023], same['WR']))
