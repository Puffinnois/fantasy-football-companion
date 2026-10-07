"""Download 2019-2025 inputs for the first-game-back study into compact CSVs."""
import csv, gzip, io, json, sys, time, urllib.request
OUT = sys.argv[1]
SEASONS = range(2019, 2026)
POS = '&'.join(f'position[]={p}' for p in ('QB', 'RB', 'WR', 'TE'))
def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ffc-research'}), timeout=60) as r:
                return r.read()
        except Exception as e:
            time.sleep(2 + 3 * attempt); err = e
    raise err
for y in SEASONS:
    for name, url in (('injuries', f'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{y}.csv'),
                      ('roster_weekly', f'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{y}.csv')):
        raw = get(url)
        if url.endswith('.gz'): raw = gzip.decompress(raw)
        open(f'{OUT}/{name}_{y}.csv', 'wb').write(raw)
    weeks = 17 if y <= 2020 else 18
    with open(f'{OUT}/sleeper_{y}.csv', 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['season', 'week', 'player_id', 'kind', 'team', 'opponent', 'pts_ppr', 'gp', 'off_snp', 'tm_off_snp'])
        for wk in range(1, weeks + 1):
            for kind in ('projections', 'stats'):
                items = json.loads(get(f'https://api.sleeper.app/{kind}/nfl/{y}/{wk}?season_type=regular&{POS}'))
                for i in items:
                    s = i.get('stats') or {}
                    if not s: continue
                    w.writerow([y, wk, i['player_id'], kind[:4], i.get('team'), i.get('opponent'), s.get('pts_ppr'),
                                s.get('gp'), s.get('off_snp', s.get('snp')), s.get('tm_off_snp')])
                time.sleep(0.3)
    print(y, 'done', flush=True)
