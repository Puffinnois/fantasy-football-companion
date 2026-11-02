#!/usr/bin/env bash
# Re-runs the Ask research probes (docs/research/2026-11-01-ask-analyst-state-of-the-art.md, Appendix B).
# Needs: Ollama on localhost:11434 with gemma3:4b, gemma3:12b, qwen3:4b, bge-m3, nomic-embed-text;
# the dev warehouse at ~/.config/FantasyCompanion/stats.duckdb; Python 3 (stdlib only).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
WORK=${WORK:-$(mktemp -d)}
echo "work dir: $WORK"
mkdir -p "$WORK"/{db,out,data,results,scripts,src}
cp "$HERE"/scripts/*.py "$WORK/scripts/"; cp "$HERE"/src/*.ts "$WORK/src/"; cp "$HERE"/data/*.json "$WORK/data/"
cp ~/.config/FantasyCompanion/stats.duckdb "$WORK/db/stats.duckdb"   # a copy: the probes never touch the app's file
ln -sfn "$REPO/node_modules" "$WORK/node_modules"
for f in export engine runsql sql; do
  (cd "$REPO" && node_modules/.bin/esbuild "$WORK/src/$f.ts" --bundle --platform=node --format=esm \
    --alias:@shared=./src/shared --alias:@main=./src/main --external:@duckdb/node-api --outfile="$WORK/out/$f.mjs" --log-level=warning)
done
node "$WORK/out/export.mjs" "$WORK/data"
cd "$WORK"
node out/sql.mjs db/stats.duckdb "SELECT table_name t, string_agg(column_name || ' ' || CASE WHEN data_type IN ('HUGEINT','BIGINT','INTEGER') THEN 'INT' WHEN data_type='DOUBLE' THEN 'DOUBLE' WHEN data_type='VARCHAR' THEN 'TEXT' ELSE data_type END, ', ' ORDER BY column_index) cols FROM duckdb_columns() WHERE table_name IN ('player_season','player_week','team_season','team_week') GROUP BY 1 ORDER BY 1" > data/ddl.jsonl
python3 -I -c "import json; rows=[json.loads(l) for l in open('data/ddl.jsonl')]; open('data/ddl.txt','w').write('\n'.join(f\"{r['t']}({r['cols']})\" for r in rows)+'\nplayers(gsis_id TEXT, name TEXT, position TEXT, team TEXT)')"
python3 -I scripts/p1.py "$WORK"                                                   # P1
python3 -I -c "
import sys, json; sys.path.insert(0, 'scripts'); import common
qs = json.load(open('data/p2_questions.json'))
for q in qs: q['cands'] = common.candidates(q['q'])
json.dump(qs, open('data/p2_questions.json', 'w'), indent=1)"
python3 -I -c "import json; json.dump([q['ref_query'] for q in json.load(open('data/p4_questions.json'))], open('data/p4_refq.json','w'))"
node out/engine.mjs db/stats.duckdb data/p4_refq.json results/p4_ref.json
python3 -I scripts/p23.py gemma3:4b "json+thought,json,free json,classified,classified v3,json+thought slim v3" results/p23.jsonl   # P2
python3 -I scripts/p23.py gemma3:12b "json+thought,json,free json,classified,classified v3,json+thought slim v3" results/p23.jsonl
python3 -I scripts/p23.py qwen3:4b "native,native think,json+thought,classified v3,native v3" results/p23.jsonl                   # P3
python3 -I scripts/p4.py gemma3:12b "dsl,sql" results/p4.jsonl                                                                    # P4
python3 -I scripts/p4.py qwen3:4b "dsl,sql" results/p4.jsonl
python3 -I scripts/summarise.py
