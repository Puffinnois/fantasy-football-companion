import json, math, re, os, time, urllib.request, urllib.error
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(f'{D}/data/catalogue.json'))
BYID = {m['id']: m for m in CAT}
PLAYERS = {'00-0034857': ('Josh Allen', 'QB', 'BUF'), '00-0036900': ("Ja'Marr Chase", 'WR', 'CIN'), '00-0038542': ('Bijan Robinson', 'RB', 'ATL'),
           '00-0032764': ('Derrick Henry', 'RB', 'BAL'), '00-0039075': ('Puka Nacua', 'WR', 'LA'), '00-0039338': ('Brock Bowers', 'TE', 'LV'),
           '00-0036358': ('CeeDee Lamb', 'WR', 'DAL'), '00-0039139': ('Jahmyr Gibbs', 'RB', 'DET'), '00-0034796': ('Lamar Jackson', 'QB', 'BAL')}
TEAMS = json.load(open(f'{D}/data/teams.json'))

# --- retrieval: the P1 winner (lexical top 3 + bge-m3 top 2, entity/position filter v2) ---
STOP = set('a an the of in on at by for to and or is are was who which what how most best top highest lowest leaders leader ranked among this year his her their every per does do get gets with from than more'.split())
def toks(s):
    s = s.lower().replace("'s", '')
    return [t for t in re.findall(r'[a-z0-9]+', s) if t not in STOP]
_docs = [toks(' '.join([m['label'], m['label'], m.get('short', ''), m.get('short', ''), m['id'].replace('_', ' '), m['description']])) for m in CAT]
_N = len(_docs); _avg = sum(map(len, _docs)) / _N; _df = {}
for d in _docs:
    for t in set(d): _df[t] = _df.get(t, 0) + 1
def bm25(q, k1=1.2, b=0.75):
    qt = toks(q); out = []
    for d in _docs:
        s = 0.0
        for t in qt:
            f = d.count(t)
            if f: s += math.log(1 + (_N - _df[t] + 0.5) / (_df[t] + 0.5)) * f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / _avg))
        out.append(s)
    return out
def ollama(path, body, timeout=900):
    req = urllib.request.Request('http://localhost:11434' + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))
def _embed1(t):
    for v in (t, t + ' .', t.lower(), t[:200]):
        try: return ollama('/api/embed', {'model': 'bge-m3', 'input': [v], 'truncate': True})['embeddings'][0]
        except urllib.error.HTTPError: pass
    return None
_cache = f'{D}/data/bge_docs.json'
if os.path.exists(_cache): _dv = json.load(open(_cache))
else:
    _dv = [_embed1(f"{m['label']}: {m['description']}") for m in CAT]; json.dump(_dv, open(_cache, 'w'))
def _cos(a, b):
    if a is None or b is None: return -1.0
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))
POS = [(r'\b(qbs?|quarterbacks?|passers?)\b', 'QB'), (r'\b(rbs?|running backs?)\b', 'RB'), (r'\b(wrs?|wide receivers?)\b', 'WR'),
       (r'\b(tes?|tight ends?)\b', 'TE'), (r'\b(kickers?)\b', 'K'), (r'\b(cornerbacks?|cbs?|safet(y|ies))\b', 'DB'), (r'\b(edge rushers?|pass rushers?)\b', 'DL')]
TEAMRX = r'\b(teams|defenses|offenses|schedule)\b'
def _allowed(q):
    ql = re.sub(r'\b(on the|against|allowed to)\s+\w+', '', q.lower()); team = re.search(TEAMRX, ql) is not None
    pos = {g for rx, g in POS if re.search(rx, ql)}
    if re.search(r'\breceivers?\b', ql): pos |= {'WR', 'TE', 'RB'}
    def ok(m):
        if team: return m['entity'] == 'team'
        if pos: return m['entity'] == 'player' and (m['positions'] == 'all' or bool(pos & set(m['positions'])))
        return True
    return ok
def candidates(q, k=5):
    lex = sorted(range(_N), key=lambda i: -bm25(q)[i]) if False else None
    s = bm25(q); lex = sorted(range(_N), key=lambda i: -s[i])
    qv = _embed1(q); e = [_cos(qv, d) for d in _dv]; emb = sorted(range(_N), key=lambda i: -e[i])
    head = lex[:3]; head += [i for i in emb if i not in head][:2]
    r = head + [i for i in lex if i not in head]
    ok = _allowed(q); r = [i for i in r if ok(CAT[i])] + [i for i in r if not ok(CAT[i])]
    return [CAT[i]['id'] for i in r[:k]]
