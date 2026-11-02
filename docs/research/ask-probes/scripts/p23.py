"""P2 / P3: can a local model pick the right compact tool and fill its slots from the resolver's context?"""
import json, sys, time
sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import D, BYID, PLAYERS, TEAMS, ollama
QS = json.load(open(f'{D}/data/p2_questions.json'))
POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']
SIT = {'red_zone': {'type': 'boolean'}, 'third_down': {'type': 'boolean'}, 'pressure': {'type': 'boolean'},
       'play_action': {'type': 'boolean'}, 'coverage': {'enum': ['man', 'zone']}}
SEASONS = {'type': 'array', 'items': {'type': 'integer'}, 'maxItems': 8, 'description': 'Seasons, e.g. [2025]. Default: the current season.'}
WEEKS = {'type': 'array', 'items': {'type': 'integer'}, 'minItems': 2, 'maxItems': 2, 'description': 'Week range [from, to]. Default: the whole season.'}
RESOLVED = ('seasons', 'weeks', 'player', 'team', 'ids')
def tools(cands, slim=False):
    T = _tools(cands)
    if not slim: return T
    return {n: (d, {k: v for k, v in p.items() if k not in RESOLVED}, [r for r in req if r not in RESOLVED]) for n, (d, p, req) in T.items()}
FLAGS = ['red_zone', 'third_down', 'pressure', 'play_action', 'man_coverage', 'zone_coverage']
def tools_v2(cands):
    """v2 shape: no slot the resolver or the metric already fixes (time, ids, entity, side); every optional enum
    starts with a neutral value; the situation filters are one list of flags (empty = none)."""
    M = {'enum': cands + ['other']}
    F = {'type': 'array', 'items': {'enum': FLAGS}, 'maxItems': 2}
    return {
        'leaderboard': ('Rank players or teams by one metric.', {'metric': M, 'position': {'enum': ['any'] + POSITIONS}, 'filters': F}, ['metric', 'position', 'filters']),
        'player_stats': ("One player's line, game log (by: week) or splits.", {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}, 'by': {'enum': ['none', 'week', 'season', 'opponent', 'down', 'coverage']}, 'filters': F}, ['metrics', 'by', 'filters']),
        'team_stats': ("One team's line, by week or split.", {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}, 'by': {'enum': ['none', 'week', 'season', 'opponent']}}, ['metrics', 'by']),
        'compare': ('2-4 players or teams side by side.', {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}}, ['metrics']),
        'describe': ('What a metric means, its sample and stability.', {'metric': M}, ['metric']),
    }
SIT_WORDS = [(r'red[- ]?zone', 'red_zone'), (r'(third|3rd) down', 'third_down'), (r'pressure', 'pressure'), (r'play[- ]action', 'play_action'),
             (r'\bman\b', 'man_coverage'), (r'\bzone coverage|vs\.? zone|against zone', 'zone_coverage')]
BY_WORDS = [(r'game log|by week|weekly|each week|week by week', 'week'), (r'by season|each season|per season', 'season'), (r'by opponent', 'opponent'), (r'by down', 'down')]
POSW = [(r'\b(qbs?|quarterbacks?|passers?)\b', 'QB'), (r'\b(rbs?|running backs?)\b', 'RB'), (r'\b(wrs?|wide receivers?|receivers?)\b', 'WR'),
        (r'\b(tes?|tight ends?)\b', 'TE'), (r'\bkickers?\b', 'K')]
def detect(q):
    """What the resolver can see in the words: situation flags, a grouping, positions."""
    t = re.sub(r'\b(on the|against the|allowed to)\s+\w+', '', q['q'].lower())
    return ([f for rx, f in SIT_WORDS if re.search(rx, t)], [b for rx, b in BY_WORDS if re.search(rx, t)], [p for rx, p in POSW if re.search(rx, t)])
def tools_v3(q):
    """v3: like v2, but a slot appears only with the options the resolver detected (none detected → no slot)."""
    flags, bys, pos = detect(q); M = {'enum': q['cands'] + ['other']}
    lb = {'metric': M}; ps = {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}}
    if pos: lb['position'] = {'enum': ['any'] + pos}
    if flags: lb['filters'] = ps['filters'] = {'type': 'array', 'items': {'enum': flags}, 'maxItems': len(flags)}
    if bys: ps['by'] = {'enum': ['none'] + bys}
    ts = {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}}
    if bys: ts['by'] = {'enum': ['none'] + [b for b in bys if b != 'down']}
    req = lambda d: list(d)
    return {'leaderboard': ('Rank players or teams by one metric.', lb, req(lb)),
            'player_stats': ("One player's line, game log or splits.", ps, req(ps)),
            'team_stats': ("One team's line, by week or split.", ts, req(ts)),
            'compare': ('2-4 players or teams side by side.', {'metrics': {'type': 'array', 'items': M, 'maxItems': 3}}, ['metrics']),
            'describe': ('What a metric means, its sample and stability.', {'metric': M}, ['metric'])}
def from_v2(call):
    """Maps a v2 call back to the tool's arguments (what the app would do)."""
    a = dict(call.get('args') or {})
    if a.get('position') == 'any': a.pop('position')
    if a.get('by') == 'none': a.pop('by')
    for f in a.pop('filters', None) or []:
        if f == 'man_coverage': a['coverage'] = 'man'
        elif f == 'zone_coverage': a['coverage'] = 'zone'
        else: a[f] = True
    m = a.get('metric')
    if call['tool'] == 'leaderboard' and m in BYID and BYID[m]['entity'] == 'team': a['entity'] = 'team'
    return {'tool': call['tool'], 'args': a}
def _tools(cands):
    M = {'enum': cands + ['other']}
    return {
        'leaderboard': ('Rank players or teams by one metric.', {
            'metric': M, 'entity': {'enum': ['player', 'team']}, 'position': {'enum': POSITIONS}, 'seasons': SEASONS, 'weeks': WEEKS,
            'team': {'type': 'string'}, **SIT, 'limit': {'type': 'integer'}}, ['metric']),
        'player_stats': ("One player's line, game log (by: week) or splits.", {
            'player': {'type': 'string', 'description': 'player id from the context'}, 'metrics': {'type': 'array', 'items': M, 'maxItems': 3},
            'seasons': SEASONS, 'weeks': WEEKS, 'by': {'enum': ['week', 'season', 'opponent', 'down', 'coverage']}, **SIT}, ['player']),
        'team_stats': ("One team's line, by week or split.", {
            'team': {'type': 'string', 'description': 'team code'}, 'side': {'enum': ['offense', 'defense']}, 'metrics': {'type': 'array', 'items': M, 'maxItems': 3},
            'seasons': SEASONS, 'weeks': WEEKS, 'by': {'enum': ['week', 'season', 'opponent']}}, ['team']),
        'compare': ('2-4 players or teams side by side.', {
            'ids': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 4}, 'metrics': {'type': 'array', 'items': M, 'maxItems': 3}, 'seasons': SEASONS, 'weeks': WEEKS}, ['ids']),
        'describe': ('What a metric means, its sample and stability.', {'metric': M}, ['metric']),
    }
BRIEF = ("You are FantasyCompanion's NFL data analyst. Answer the question by calling exactly one tool. "
         "Data: NFL seasons 2019-2026; the current season is 2026, played through week 7; regular season by default. "
         "Use only the player ids, team codes and metric ids given in the context. Pick the metric candidate that fits; "
         "use \"other\" only if none fits. Leave out arguments you don't need: defaults are filled by the app.")
def context(q):
    lines = [f"Question: {q['q']}", 'Context (resolved by the app):']
    for pid in q.get('players', []):
        n, pos, tm = PLAYERS[pid]; lines.append(f'- Player: {n} = {pid} ({pos}, {tm})')
    for t in q.get('teams', []): lines.append(f'- Team: {TEAMS.get(t, t)} = {t}')
    if q.get('time'): lines.append(f"- Time: {q['time']}")
    lines.append('- Metric candidates:')
    for c in q['cands']:
        m = BYID[c]; lines.append(f"  - {c}: {m['label']} ({m['entity']}) — {m['description'][:110]}")
    return '\n'.join(lines)
def tool_text(T):
    out = []
    for name, (desc, props, req) in T.items():
        args = ', '.join(f"{k}{'' if k in req else '?'}" for k in props)
        out.append(f'- {name}({args}): {desc}')
    return 'Tools:\n' + '\n'.join(out)
def union_schema(T, thought):
    props = {}
    for _, (_, p, _) in T.items(): props.update(p)
    s = {'type': 'object', 'properties': {}, 'required': []}
    if thought: s['properties']['thought'] = {'type': 'string'}; s['required'].append('thought')
    s['properties']['tool'] = {'enum': list(T)}; s['properties']['args'] = {'type': 'object', 'properties': props}
    s['required'] += ['tool', 'args']
    return s
def native_tools(T):
    return [{'type': 'function', 'function': {'name': n, 'description': d, 'parameters': {'type': 'object', 'properties': p, 'required': r}}} for n, (d, p, r) in T.items()]

def check_type(v, sch):
    if 'enum' in sch: return v in sch['enum']
    t = sch.get('type')
    if t == 'boolean': return isinstance(v, bool)
    if t == 'integer': return isinstance(v, int) and not isinstance(v, bool)
    if t == 'string': return isinstance(v, str)
    if t == 'array': return isinstance(v, list) and all(check_type(x, sch['items']) for x in v)
    return True
def validate(call, T):
    """strict: accepted by a validator that rejects unknown args; lenient: unknown args ignored."""
    if not isinstance(call, dict) or call.get('tool') not in T or not isinstance(call.get('args'), dict): return False, False, 'shape'
    _, props, req = T[call['tool']]; a = call['args']
    if any(r not in a for r in req): return False, False, 'missing required'
    known = {k: v for k, v in a.items() if k in props}
    if not all(check_type(v, props[k]) for k, v in known.items()): return False, False, 'bad value'
    if call['tool'] == 'leaderboard' and a.get('metric') == 'other': pass
    return len(known) == len(a), True, '' if len(known) == len(a) else 'unknown args: ' + ','.join(k for k in a if k not in props)

def seasons_of(a): return sorted(a.get('seasons') or [2026])
def weeks_of(a):
    w = a.get('weeks')
    if not w or list(w) == [1, 7] and seasons_of(a) == [2026]: return None
    return list(w)
SITK = ['red_zone', 'third_down', 'pressure', 'play_action', 'coverage']
def right(call, ref, slim=False):
    if not isinstance(call, dict) or call.get('tool') != ref['tool']: return False
    a = dict(call.get('args') or {})
    if slim:  # the app fills these from the resolver (deterministic, tested on its own)
        for k in RESOLVED: a.pop(k, None)
        for k in ('seasons', 'weeks', 'player', 'team', 'ids'):
            if k in ref: a[k] = ref[k]
    t = ref['tool']
    if seasons_of(a) != sorted(ref.get('seasons', [2026])): return False
    if weeks_of(a) != ref.get('weeks'): return False
    allowed_sit = {k for k in SITK if k in ref}
    if t == 'player_stats' and ref.get('pressure_or_metric'): allowed_sit.add('pressure')
    if t == 'player_stats' and ref.get('coverage'): allowed_sit.add('coverage')
    for k in SITK:
        if a.get(k) not in (None, False) and k not in allowed_sit: return False
    for k in SITK:
        if k in ref and t != 'player_stats' and a.get(k) != ref[k]: return False
    ms = a.get('metrics') or ([a['metric']] if a.get('metric') else [])
    if t in ('leaderboard', 'describe'):
        if a.get('metric') not in ref['metric']: return False
    if t == 'leaderboard':
        if 'position' in ref and a.get('position') != ref['position']: return False
        if ref.get('entity') == 'team' and a.get('entity') not in ('team', None): return False
        if ref.get('entity') == 'team' and a.get('position'): return False
    if t == 'player_stats':
        if a.get('player') != ref['player']: return False
        if 'by' in ref and a.get('by') != ref['by']: return False
        if 'red_zone' in ref and not a.get('red_zone'): return False
        if ref.get('coverage') and not (a.get('coverage') == ref['coverage'] or a.get('by') == 'coverage'): return False
        if ref.get('pressure_or_metric'):
            if not ('pressured_epa' in ms or ('qb_epa_db' in ms and a.get('pressure'))): return False
        elif 'metrics_any' in ref and not set(ms) & set(ref['metrics_any']): return False
        if 'by' not in ref and a.get('by') not in (None, 'coverage' if ref.get('coverage') else None): return False
    if t == 'team_stats':
        if a.get('team') != ref['team']: return False
        if not set(ms) & set(ref['metrics_any']): return False
        if 'by' in ref and a.get('by') != ref['by']: return False
        if 'by' not in ref and a.get('by'): return False
    if t == 'compare':
        if sorted(a.get('ids') or []) != sorted(ref['ids']): return False
        if not set(ms) & set(ref['metrics_any']): return False
    return True

import re
def classify(q):
    """The deterministic question-type rule (report R7): picks the tool from the resolver's output."""
    t = q['q'].lower(); np = len(q.get('players', [])); nt = len(q.get('teams', []))
    if np == 0 and re.search(r"\bwhat (is|does)\b|\bmeans?\b|\bdefin", t): return 'describe'
    if np >= 2: return 'compare'
    if np == 1: return 'player_stats'
    if nt == 1: return 'team_stats'
    return 'leaderboard'
def parse_json(s):
    s = s.strip()
    if s.startswith('```'): s = s.strip('`'); s = s[s.find('{'):]
    i, j = s.find('{'), s.rfind('}')
    return json.loads(s[i:j + 1])
def run_one(model, arm, q):
    slim = 'slim' in arm or arm.startswith('classified')
    v3 = arm.endswith('v3')
    v2 = arm.endswith('v2') or v3
    T = tools_v3(q) if v3 else tools_v2(q['cands']) if v2 else tools(q['cands'], slim)
    sysmsg = BRIEF + '\n' + tool_text(T)
    body = {'model': model, 'stream': False, 'options': {'temperature': 0, 'seed': 1, 'num_ctx': 8192, 'num_predict': 512}}
    if model.startswith('qwen3'):
        body['think'] = arm.endswith('think')
        body['options']['num_predict'] = 2048  # this build reasons in the reply even with think off
    fixed_tool = None
    if arm.startswith('native'):
        body['messages'] = [{'role': 'system', 'content': BRIEF}, {'role': 'user', 'content': context(q)}]
        body['tools'] = native_tools(T)
    elif arm.startswith('classified'):
        fixed_tool = classify(q); d, props, req = T[fixed_tool]
        body['messages'] = [{'role': 'system', 'content': BRIEF + f'\nThe app chose the tool: {fixed_tool} — {d}\nArguments: ' + ', '.join(props) + '\nReply with only a JSON object: {"thought": "...", "args": {...}}'}, {'role': 'user', 'content': context(q)}]
        body['format'] = {'type': 'object', 'properties': {'thought': {'type': 'string'}, 'args': {'type': 'object', 'properties': props, 'required': req}}, 'required': ['thought', 'args']}
    else:
        shape = '{"thought": "...", "tool": "...", "args": {...}}' if 'thought' in arm or arm == 'free json' else '{"tool": "...", "args": {...}}'
        body['messages'] = [{'role': 'system', 'content': sysmsg + f'\nReply with only a JSON object: {shape}'}, {'role': 'user', 'content': context(q)}]
        if arm.startswith('json'): body['format'] = union_schema(T, 'thought' in arm)
    t0 = time.time()
    try:
        r = ollama('/api/chat', body)
    except Exception as e:
        return {'error': str(e)[:200], 'wall_s': time.time() - t0}
    wall = time.time() - t0; msg = r['message']; call = None; raw = msg.get('content', '')
    try:
        if arm.startswith('native'):
            tc = (msg.get('tool_calls') or [None])[0]
            if tc: call = {'tool': tc['function']['name'], 'args': tc['function']['arguments']}
        elif fixed_tool:
            call = {'tool': fixed_tool, 'args': parse_json(raw).get('args')}
        else:
            call = parse_json(raw)
    except Exception:
        call = None
    strict, lenient, why = validate(call, T) if call else (False, False, 'no call / unparsable')
    if v2 and call and lenient: call = from_v2(call)
    return {'call': call, 'raw': raw[:600], 'thinking': (msg.get('thinking') or '')[:300], 'strict_valid': strict, 'valid': lenient, 'why': why,
            'right': bool(call) and lenient and right(call, q['ref'], slim), 'wall_s': round(wall, 2),
            'prompt_tokens': r.get('prompt_eval_count'), 'out_tokens': r.get('eval_count')}

if __name__ == '__main__':
    model, arms, out = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
    with open(out, 'a') as f:
        ollama('/api/chat', {'model': model, 'stream': False, 'messages': [{'role': 'user', 'content': 'hi'}], 'options': {'num_ctx': 8192, 'num_predict': 1}})  # load
        for arm in arms:
            for q in QS:
                res = run_one(model, arm, q) | {'model': model, 'arm': arm, 'qid': q['id'], 'gold_in_cands': not (q['ref'].get('metric') or q['ref'].get('metrics_any')) or bool(set(q['ref'].get('metric') or q['ref'].get('metrics_any')) & set(q['cands']))}
                f.write(json.dumps(res) + '\n'); f.flush()
                print(model, arm, q['id'], 'valid' if res.get('valid') else 'INVALID', 'RIGHT' if res.get('right') else '-', res.get('wall_s'), res.get('why', res.get('error', '')), flush=True)
