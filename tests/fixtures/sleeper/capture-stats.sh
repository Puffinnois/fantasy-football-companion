#!/usr/bin/env bash
# Re-captures the Sleeper weekly stat fixtures from the live (unofficial) endpoint: chosen rows of
# 2026 week 4, and KC's 2025 week 7 shutout (no `pts_allow` key: Sleeper drops zeros).
# Usage: tests/fixtures/sleeper/capture-stats.sh   (needs curl and node)
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
url=https://api.sleeper.app/stats/nfl
pos='&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF'
pick() { # pick SEASON WEEK OUT ID...
  local season=$1 week=$2 out=$3
  shift 3
  curl -s --compressed "$url/$season/$week?season_type=regular$pos" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const ids = process.argv.slice(1)
  const rows = JSON.parse(s).filter((r) => ids.includes(r.player_id))
  rows.sort((a, b) => ids.indexOf(a.player_id) - ids.indexOf(b.player_id))
  process.stdout.write(JSON.stringify(rows, null, 1) + "\n")
})' "$@" > "$dir/$out"
}
pick 2026 4 stats_2026_4.json 4866 7564 9509 6794 LAR KC 11261 96 5012 7865
pick 2025 7 stats_2025_7_kc.json KC
wc -c "$dir"/stats_*.json
