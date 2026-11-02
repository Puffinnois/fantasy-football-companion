import json, math, re, sys, time, urllib.request, urllib.error
D = sys.argv[1]
cat = json.load(open(f'{D}/data/catalogue.json'))
qs = json.load(open(f'{D}/data/p1_questions.json'))
STOP = set('a an the of in on at by for to and or is are was who which what how most best top highest lowest leaders leader ranked among this year his her their every per does do get gets with from than more his'.split())
def toks(s):
    s = s.lower().replace("'s", '')
    return [t for t in re.findall(r'[a-z0-9]+', s) if t not in STOP]
def doc_text(m):  # label and short twice: a field boost
    return ' '.join([m['label'], m['label'], m.get('short', ''), m.get('short', ''), m['id'].replace('_', ' '), m['description']])
docs = [toks(doc_text(m)) for m in cat]
N = len(docs); avg = sum(map(len, docs)) / N
df = {}
for d in docs:
    for t in set(d): df[t] = df.get(t, 0) + 1
def bm25(q, k1=1.2, b=0.75):
    qt = toks(q); out = []
    for i, d in enumerate(docs):
        s = 0.0; L = len(d)
        for t in qt:
            f = d.count(t)
            if not f: continue
            idf = math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * L / avg))
        out.append(s)
    return out
NAN_FAIL = {}
def _post(model, texts):
    req = urllib.request.Request('http://localhost:11434/api/embed', data=json.dumps({'model': model, 'input': texts, 'truncate': True}).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=600))['embeddings']
def embed(model, texts, chunk=16):
    out = []
    for i in range(0, len(texts), chunk):
        part = texts[i:i + chunk]
        try:
            out += _post(model, part); continue
        except urllib.error.HTTPError:
            pass
        for t in part:  # one at a time; a NaN answer is retried with a small change, then given up
            for variant in (t, t + ' .', t.lower(), t[:200]):
                try:
                    out += _post(model, [variant]); break
                except urllib.error.HTTPError:
                    continue
            else:
                NAN_FAIL.setdefault(model, []).append(t[:60]); out.append(None)
    return out
def cos(a, b):
    if a is None or b is None: return -1.0
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))
def rank(scores): return sorted(range(N), key=lambda i: -scores[i])
ranks = {'lexical': [rank(bm25(q['q'])) for q in qs]}
timing = {}
for model, qp, dp in [('bge-m3', '', ''), ('nomic-embed-text', 'search_query: ', 'search_document: ')]:
    t0 = time.time()
    dv = embed(model, [dp + f"{m['label']}: {m['description']}" for m in cat])
    t1 = time.time()
    qv = embed(model, [qp + q['q'] for q in qs])
    t2 = time.time()
    timing[model] = {'docs_s': round(t1 - t0, 2), 'per_query_ms': round((t2 - t1) / len(qs) * 1000, 1)}
    ranks[model] = [rank([cos(v, d) for d in dv]) for v in qv]
def rrf(*rs, k=60):
    out = []
    for per in zip(*rs):
        sc = [0.0] * N
        for r in per:
            for pos, i in enumerate(r): sc[i] += 1 / (k + pos + 1)
        out.append(rank(sc))
    return out
ranks['lexical+bge-m3 (RRF)'] = rrf(ranks['lexical'], ranks['bge-m3'])
ranks['lexical+nomic (RRF)'] = rrf(ranks['lexical'], ranks['nomic-embed-text'])

# Entity / position filter from words in the question (what the resolver would do), applied to any ranking.
POS = [(r'\b(qbs?|quarterbacks?|passers?)\b', 'QB'), (r'\b(rbs?|running backs?)\b', 'RB'), (r'\b(wrs?|wide receivers?)\b', 'WR'),
       (r'\b(tes?|tight ends?)\b', 'TE'), (r'\b(kickers?)\b', 'K'), (r'\b(cornerbacks?|cbs?|safet(y|ies))\b', 'DB'),
       (r'\b(edge rushers?|pass rushers?)\b', 'DL')]
TEAM = r'\b(teams?|defenses|offenses|schedule)\b'
def allowed(q):
    ql = q.lower(); team = re.search(TEAM, ql) is not None
    pos = {g for rx, g in POS if re.search(rx, ql)}
    if re.search(r'\breceivers?\b', ql): pos |= {'WR', 'TE', 'RB'}
    def ok(m):
        if team: return m['entity'] == 'team'
        if pos: return m['entity'] == 'player' and (m['positions'] == 'all' or bool(pos & set(m['positions'])))
        return True
    return ok
def filtered(rs):
    out = []
    for q, r in zip(qs, rs):
        ok = allowed(q['q']); keep = [i for i in r if ok(cat[i])]
        out.append(keep + [i for i in r if not ok(cat[i])])
    return out
def union_first(a, b, k_a=3):
    out = []
    for ra, rb in zip(a, b):
        head = ra[:k_a]; head += [i for i in rb if i not in head][:2]
        out.append(head + [i for i in ra if i not in head])
    return out
ranks['lexical+filter'] = filtered(ranks['lexical'])
ranks['bge-m3+filter'] = filtered(ranks['bge-m3'])
ranks['RRF(lex,bge)+filter'] = filtered(ranks['lexical+bge-m3 (RRF)'])
ranks['lex top3 + bge top2, filtered'] = filtered(union_first(ranks['lexical'], ranks['bge-m3']))
# v2: two rule fixes found by reading the misses (so optimistic): "team's" is not a team question, and a
# position after "on the" / "against" / "allowed to" is the object, not the subject.
TEAM = r'\b(teams|defenses|offenses|schedule)\b'
_allowed = allowed
def allowed(q):
    return _allowed(re.sub(r'\b(on the|against|allowed to)\s+\w+', '', q))
ranks['lexical+filter v2'] = filtered(ranks['lexical'])
ranks['RRF(lex,bge)+filter v2'] = filtered(ranks['lexical+bge-m3 (RRF)'])
ranks['lex top3 + bge top2, filter v2'] = filtered(union_first(ranks['lexical'], ranks['bge-m3']))
ids = [m['id'] for m in cat]
res = {'timing': timing, 'nan_failures': NAN_FAIL, 'methods': {}, 'misses': {}}
for name, rs in ranks.items():
    hits = {k: 0 for k in (1, 3, 5, 10)}; mrr = 0.0; misses = []
    for q, r in zip(qs, rs):
        top = [ids[i] for i in r]
        pos = min((top.index(g) for g in q['gold']), default=999)
        mrr += 1 / (pos + 1)
        for k in hits: hits[k] += pos < k
        if pos >= 5: misses.append({'q': q['q'], 'gold': q['gold'], 'pos': pos + 1, 'top3': top[:3]})
    res['methods'][name] = {f'R@{k}': round(v / len(qs), 3) for k, v in hits.items()} | {'MRR': round(mrr / len(qs), 3)}
    res['misses'][name] = misses
json.dump(res, open(f'{D}/results/p1.json', 'w'), indent=1)
for n, m in res['methods'].items(): print(f'{n:24s}', m)
print('timing', timing); print('nan failures', {k: len(v) for k, v in NAN_FAIL.items()}, NAN_FAIL)
