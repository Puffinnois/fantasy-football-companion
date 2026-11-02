"""P4: the engine's DSL (StatsQuery) vs raw DuckDB SQL, written by the same local model, graded by execution."""
import json, subprocess, sys, time, os
sys.path.insert(0, os.path.dirname(__file__))
from common import D, BYID, PLAYERS, TEAMS, ollama, candidates
QS = json.load(open(f'{D}/data/p4_questions.json'))
REF = json.load(open(f'{D}/results/p4_ref.json'))
SCHEMA = json.load(open(f'{D}/data/querySchema.json')); SCHEMA.pop('$schema', None)
def enum_bounds(node):
    """dsl2: numeric bounds as enums (grammar-constrained decoding garbles minimum/maximum integers)."""
    if isinstance(node, dict):
        if node.get('type') in ('integer', 'number') and ('minimum' in node or 'maximum' in node):
            lo, hi = node.get('minimum'), node.get('maximum')
            if lo is not None and hi is not None and hi - lo <= 30: return {'enum': list(range(int(lo), int(hi) + 1))}
            return {k: v for k, v in node.items() if k not in ('minimum', 'maximum')} | {'type': 'integer'}
        return {k: enum_bounds(v) for k, v in node.items()}
    if isinstance(node, list): return [enum_bounds(x) for x in node]
    return node
SCHEMA2 = enum_bounds(SCHEMA)
SCHEMA2['properties']['scope']['properties']['seasons']['items'] = {'enum': list(range(2019, 2027))}
SCHEMA2['properties']['scope']['properties']['weeks']['items'] = {'enum': list(range(1, 23))}
DDL = open(f'{D}/data/ddl.txt').read()
BRIEF = ("You are FantasyCompanion's NFL data analyst. Data: NFL seasons 2019-2026; the current season is 2026, played through week 7; "
         "regular season ('REG') only. Use the player ids and metric ids given in the context.")
DSL = ("Write one StatsQuery JSON for the question. Fields: entity ('player' or 'team'); metrics (catalogue ids; the first is the one ranked); "
       "scope: {seasons: [..], weeks: [from, to] (optional), positions: ['QB'|'RB'|'WR'|'TE'|...] (players only), players: [ids] (optional), "
       "qualifiedOnly: true for rankings}; limit. Rankings are sorted best first automatically.\n"
       'Example: {"entity": "player", "metrics": ["rec_yds"], "scope": {"seasons": [2025], "positions": ["WR"], "qualifiedOnly": true}, "limit": 10}')
SQL = ("Write one DuckDB SQL query that answers the question. Tables (one row per player or team, season, season_type; *_week tables add week):\n" + DDL +
       "\nConventions: filter season_type = 'REG'; player_season.position is QB/RB/WR/TE/...; team codes are nflverse (e.g. LA = Rams). "
       "A metric formula {x} means SUM(x) over the rows in scope (use player_week with a week filter for week ranges). "
       "Qualified = the metric's sample column summed is at least minSample x weeks_in_scope / 17 (2026 has 7 weeks, other seasons 18). "
       "Return the id (gsis_id or team), the name, and the value, best first, LIMIT 10.\n"
       "Example: SELECT s.gsis_id, p.name, sum(s.rec_yds) AS value FROM player_season s JOIN players p USING (gsis_id) "
       "WHERE s.season = 2025 AND s.season_type = 'REG' AND s.position = 'WR' GROUP BY 1, 2 ORDER BY value DESC LIMIT 10")
def context(q, sql):
    lines = [f"Question: {q['q']}", 'Context (resolved by the app):']
    for pid in q.get('players', []):
        n, pos, tm = PLAYERS[pid]; lines.append(f'- Player: {n} = {pid} ({pos}, {tm})')
    if q.get('time'): lines.append(f"- Time: {q['time']}")
    lines.append('- Metric candidates:')
    for c in candidates(q['q']):
        m = BYID[c]; extra = f" | formula: {m['value']} | sample: {m['sample']} | minSample: {m.get('minSample')} | {m['direction']} is better" if sql else ''
        lines.append(f"  - {c}: {m['label']} ({m['entity']}) — {m['description'][:100]}{extra}")
    return '\n'.join(lines)
def call(model, arm, q, feedback=None):
    sql = arm == 'sql'
    sysmsg = BRIEF + '\n' + (SQL if sql else DSL)
    fmt = {'type': 'object', 'properties': {'thought': {'type': 'string'}, 'sql': {'type': 'string'}}, 'required': ['thought', 'sql']} if sql else (SCHEMA2 if arm == 'dsl2' else SCHEMA)
    msgs = [{'role': 'system', 'content': sysmsg}, {'role': 'user', 'content': context(q, sql)}]
    if feedback: msgs += [{'role': 'assistant', 'content': feedback[0]}, {'role': 'user', 'content': f'That failed: {feedback[1]}\nFix it and reply again.'}]
    body = {'model': model, 'stream': False, 'format': fmt, 'messages': msgs, 'options': {'temperature': 0, 'seed': 1, 'num_ctx': 16384, 'num_predict': 700}}
    if model.startswith('qwen3'): body['think'] = False
    t0 = time.time(); r = ollama('/api/chat', body); wall = time.time() - t0
    return r['message']['content'], wall, r.get('prompt_eval_count'), r.get('eval_count')
def execute(arm, payloads):
    """payloads: parsed StatsQuery dicts (dsl) or SQL strings (sql); None = unparsable."""
    idx = [i for i, p in enumerate(payloads) if p is not None]
    out = [{'ok': False, 'error': 'unparsable reply'}] * len(payloads)
    if not idx: return out
    fin, fout = f'{D}/data/_in.json', f'{D}/results/_out.json'
    json.dump([payloads[i] for i in idx], open(fin, 'w'))
    subprocess.run(['node', f'{D}/out/' + ('engine.mjs' if arm.startswith('dsl') else 'runsql.mjs'), f'{D}/db/stats.duckdb', fin, fout], check=True, cwd=D)
    res = json.load(open(fout)); out = list(out)
    for i, r in zip(idx, res): out[i] = r
    return out
def identities(row):
    return {str(v) for v in row.values() if isinstance(v, str)} | ({row['id'], row['name']} if 'id' in row else set())
def numbers(row):
    vals = list(row['values'].values()) if 'values' in row else list(row.values())
    return [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
def grade(q, ref, res):
    if not res.get('ok') or not res.get('rows'): return False
    rows = res['rows']
    if q['kind'] == 'lb':
        want = [(r['id'], r['name']) for r in ref['rows'][:3]]
        got = [identities(r) for r in rows[:5]]
        return all(any(i in g or n in g for g in got) for i, n in want)
    v = list(ref['rows'][0]['values'].values())[0]
    return any(abs(x - v) <= max(0.01, abs(v) * 0.01) for x in numbers(rows[0]))
def parse(arm, raw):
    try:
        j = json.loads(raw)
        return j['sql'] if arm == 'sql' else j
    except Exception:
        return None
if __name__ == '__main__':
    model, arms, outp = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
    with open(outp, 'a') as f:
        for arm in arms:
            raws = [call(model, arm, q) for q in QS]
            pay = [parse(arm, r[0]) for r in raws]
            res = execute(arm, pay)
            # one retry with the error, as the loop's "errors teach" would do
            retry_i = [i for i, r in enumerate(res) if not r.get('ok')]
            raws2 = {i: call(model, arm, QS[i], (raws[i][0], res[i].get('error', ''))) for i in retry_i}
            pay2 = {i: parse(arm, raws2[i][0]) for i in retry_i}
            res2 = dict(zip(retry_i, execute(arm, [pay2[i] for i in retry_i]))) if retry_i else {}
            for i, q in enumerate(QS):
                final = res2.get(i, res[i])
                rec = {'model': model, 'arm': arm, 'qid': q['id'], 'kind': q['kind'], 'payload': pay[i], 'ok1': res[i].get('ok'), 'error1': res[i].get('error'),
                       'right1': grade(q, REF[i], res[i]), 'right2': grade(q, REF[i], final), 'retried': i in res2, 'payload2': pay2.get(i),
                       'error2': res2[i].get('error') if i in res2 else None, 'wall_s': round(raws[i][1] + (raws2[i][1] if i in raws2 else 0), 1),
                       'prompt_tokens': raws[i][2], 'out_tokens': raws[i][3], 'top_rows': (final.get('rows') or [])[:3]}
                f.write(json.dumps(rec, default=str) + '\n'); f.flush()
                print(model, arm, q['id'], 'R1' if rec['right1'] else '-', 'R2' if rec['right2'] else '-', rec['wall_s'], (rec['error1'] or '')[:90], flush=True)
