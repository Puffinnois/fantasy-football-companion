import json, statistics, sys, collections, os
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = [json.loads(l) for l in open(f'{D}/results/p23.jsonl')]
g = collections.OrderedDict()
for r in rows: g.setdefault((r['model'], r['arm']), []).append(r)
print('| Model | Mode | Valid | Right (20) | Right when the resolver found the metric (18) | p50 s | p90 s |')
print('| --- | --- | --- | --- | --- | --- | --- |')
for (m, a), rs in g.items():
    lat = sorted(x.get('wall_s', 0) for x in rs)
    gi = [x for x in rs if x['gold_in_cands']]
    p90 = lat[int(0.9 * (len(lat) - 1))]
    print(f"| {m} | {a} | {sum(x.get('valid', 0) for x in rs)} | {sum(x.get('right', 0) for x in rs)} | {sum(x.get('right', 0) for x in gi)} | {statistics.median(lat):.1f} | {p90:.1f} |")
if os.path.exists(f'{D}/results/p4.jsonl'):
    rows = [json.loads(l) for l in open(f'{D}/results/p4.jsonl')]
    g = collections.OrderedDict()
    for r in rows: g.setdefault((r['model'], r['arm']), []).append(r)
    print('\n| Model | Path | Ran first time | Right first time (15) | Right after one retry with the error | Rankings right (10) | Lookups right (5) | p50 s |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (m, a), rs in g.items():
        print(f"| {m} | {a} | {sum(bool(x['ok1']) for x in rs)} | {sum(x['right1'] for x in rs)} | {sum(x['right2'] for x in rs)} | "
              f"{sum(x['right2'] for x in rs if x['kind'] == 'lb')} | {sum(x['right2'] for x in rs if x['kind'] == 'lk')} | {statistics.median(x['wall_s'] for x in rs):.1f} |")
