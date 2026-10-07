"""First-game-back study: actual vs Sleeper (RotoWire) projection after an injury absence, 2019-2025.

Episode = run of consecutive team games a player missed with injury evidence (injury report Out/Doubtful/
Questionable that week, or roster status R01 IR / R04 PUP). Return game k = k-th game played afterwards.
Effect = (sum actual / sum projected) in return game k, divided by the same ratio over the same players'
other games (control). CIs: bootstrap over episodes.
"""
import json
import sys
import numpy as np
import pandas as pd

D = sys.argv[1]
SEASONS = range(2019, 2026)
SOFT = {'hamstring', 'calf', 'groin', 'quadricep', 'quadriceps', 'thigh', 'abdomen', 'oblique', 'pectoral', 'achilles'}
rng = np.random.default_rng(7)

# ---------- load ----------
sl = pd.concat([pd.read_csv(f'{D}/sleeper_{y}.csv', dtype={'player_id': str}) for y in SEASONS])
proj = sl[sl.kind == 'proj'][['season', 'week', 'player_id', 'pts_ppr']].rename(columns={'pts_ppr': 'proj'})
stat = sl[sl.kind == 'stat'][['season', 'week', 'player_id', 'team', 'pts_ppr', 'gp', 'off_snp', 'tm_off_snp']]
stat = stat.rename(columns={'pts_ppr': 'act'})
stat['played'] = stat.gp.fillna(0) > 0
team_played = set(map(tuple, stat[stat.played][['season', 'team', 'week']].drop_duplicates().values))
last_week = {y: (17 if y <= 2020 else 18) for y in SEASONS}

ros = pd.concat([pd.read_csv(f'{D}/roster_weekly_{y}.csv', low_memory=False,
                             usecols=['season', 'week', 'game_type', 'team', 'position', 'status',
                                      'gsis_id', 'sleeper_id', 'birth_date'])
                 for y in SEASONS])
ros = ros[(ros.game_type == 'REG') & ros.position.isin(['QB', 'RB', 'WR', 'TE']) & ros.sleeper_id.notna()]
ros['player_id'] = ros.sleeper_id.astype('Int64').astype(str)
ros = ros.drop_duplicates(['season', 'week', 'player_id'])
inj = pd.concat([pd.read_csv(f'{D}/injuries_{y}.csv', low_memory=False) for y in SEASONS])
inj = inj[inj.game_type == 'REG'][['season', 'week', 'gsis_id', 'report_status', 'report_primary_injury']]
inj = inj.drop_duplicates(['season', 'week', 'gsis_id'])

g = ros.merge(inj, on=['season', 'week', 'gsis_id'], how='left')
g = g.merge(stat.drop(columns='team'), on=['season', 'week', 'player_id'], how='left')
g = g.merge(proj, on=['season', 'week', 'player_id'], how='left')
g['played'] = g.played.fillna(False).astype(bool)
g = g[[(s, t, w) in team_played for s, t, w in zip(g.season, g.team, g.week)]]  # drop byes
g['inj_absent'] = (~g.played) & (g.report_status.isin(['Out', 'Doubtful', 'Questionable'])
                                 | g.status.isin(['RES', 'PUP']))
g['snap'] = g.off_snp / g.tm_off_snp
g = g.sort_values(['player_id', 'season', 'week'])

# ---------- episodes ----------
eps, ret_rows = [], []
for (pid, season), h in g.groupby(['player_id', 'season'], sort=False):
    h = h.reset_index(drop=True)
    i = 0
    while i < len(h):
        if not h.inj_absent[i]:
            i += 1; continue
        j = i
        while j < len(h) and h.inj_absent[j]:
            j += 1
        start, end = i, j  # absent games [i, j); return game index j
        i = j
        if end >= len(h) or not h.played[end]:
            continue
        pre = h.iloc[max(0, start - 6):start]
        pre = pre[pre.played & pre.proj.notna()]
        if len(pre) < 3 or pre.proj.mean() < 5 or (pre.team != h.team[end]).any():
            continue
        if h.week[end] >= last_week[season]:
            continue
        body = h.iloc[start:end].report_primary_injury.dropna().str.lower()
        body = body.mode().iloc[0] if len(body) else 'unknown'
        ep = dict(eid=len(eps), player_id=pid, season=season, pos=h.position[end], missed=end - start,
                  body=body, soft=any(s in body for s in SOFT), ir=h.iloc[start:end].status.eq('RES').any(),
                  base_proj=pre.proj.mean(), base_act=pre.act.mean(), base_snap=pre.snap.mean())
        eps.append(ep)
        k, idx = 0, end
        while k < 3 and idx < len(h) and h.played[idx] and h.team[idx] == h.team[end]:
            r = h.iloc[idx]
            if pd.notna(r.proj) and r.week < last_week[season]:
                ret_rows.append(dict(eid=ep['eid'], k=k + 1, week=r.week, proj=r.proj,
                                     act=0 if pd.isna(r.act) else r.act, snap=r.snap))
            k += 1; idx += 1
eps = pd.DataFrame(eps)
ret = pd.DataFrame(ret_rows).merge(eps, on='eid')

# ---------- control: same players, other played games with a projection ----------
study_players = set(zip(eps.player_id, eps.season))
return_games = set(zip(ret.player_id, ret.season, ret.week))
ctrl = g[g.played & g.proj.notna() & (g.proj >= 3)
         & np.array([(p, s) in study_players and (p, s, w) not in return_games
                     for p, s, w in zip(g.player_id, g.season, g.week)])].copy()
ctrl_ratio = {pos: d.act.fillna(0).sum() / d.proj.sum() for pos, d in ctrl.groupby('position')}
json.dump(ctrl_ratio, open(f'{D}/../control_ratio.json', 'w'))


def ratio_ci(d, n=2000):
    a, p = d.act.to_numpy(), d.proj.to_numpy()
    point = a.sum() / p.sum()
    idx = rng.integers(0, len(d), size=(n, len(d)))
    boots = a[idx].sum(1) / p[idx].sum(1)
    return point, np.percentile(boots, 2.5), np.percentile(boots, 97.5)


def table(df, by):
    out = []
    for key, d in df.groupby(by):
        key = key if isinstance(key, tuple) else (key,)
        pos = key[by.index('pos')] if 'pos' in by else None
        r, lo, hi = ratio_ci(d)
        c = ctrl_ratio[pos] if pos else 1.0
        out.append(dict(zip(by, key), n=len(d), raw=round(r, 3), effect=round(r / c, 3),
                        lo=round(lo / c, 3), hi=round(hi / c, 3),
                        proj_vs_base=round((d.proj / d.base_proj).median(), 3),
                        snap_vs_base=round((d.snap / d.base_snap).median(), 3)))
    return pd.DataFrame(out)


pd.set_option('display.width', 200)
print('episodes', len(eps), '| by pos', eps.pos.value_counts().to_dict(), '| IR', int(eps.ir.sum()))
print('control ratio actual/proj by pos', {k: round(v, 3) for k, v in ctrl_ratio.items()})
print('\n== by position x game back ==')
print(table(ret, ['pos', 'k']).to_string(index=False))
print('\n== game 1 back: soft-tissue vs other ==')
print(table(ret[ret.k == 1], ['pos', 'soft']).to_string(index=False))
ret['missed_b'] = pd.cut(ret.missed, [0, 1, 3, 99], labels=['1', '2-3', '4+'])
print('\n== game 1 back by games missed ==')
print(table(ret[ret.k == 1], ['pos', 'missed_b']).to_string(index=False))
print('\n== top body parts (episodes) ==', eps.body.value_counts().head(10).to_dict())
eps.to_csv(f'{D}/../episodes.csv', index=False); ret.to_csv(f'{D}/../return_games.csv', index=False)
