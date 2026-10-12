#!/usr/bin/env bash
# Re-captures tests/fixtures/warehouse/* from the live sources: the header plus the first rows of each
# file (all-seasons files filtered to 2025 first). Usage: tests/fixtures/warehouse/capture.sh
# Needs curl, gunzip and node; `head` closing the pipe is expected.
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
base=https://github.com/nflverse/nflverse-data/releases/download
ff=https://github.com/ffverse/ffopportunity/releases/download/latest-data
# get URL OUT [ROWS] [AWK-CONDITION]: the header plus the first ROWS (default 20) data rows passing the condition
get() {
  curl -sL "$1" | { case "$1" in *.gz) gunzip ;; *) cat ;; esac } \
    | awk -F, "NR == 1 || (${4:-1})" | head -n $((${3:-20} + 1)) > "$dir/$2"
}
get "$base/nextgen_stats/ngs_passing.csv.gz" ngs_passing.csv 20 '$1 == "2025"'
get "$base/nextgen_stats/ngs_rushing.csv.gz" ngs_rushing.csv 20 '$1 == "2025"'
get "$base/nextgen_stats/ngs_receiving.csv.gz" ngs_receiving.csv 20 '$1 == "2025"'
for kind in pass rush rec def; do
  get "$base/pfr_advstats/advstats_week_${kind}_2025.csv.gz" "advstats_week_${kind}_2025.csv"
done
get "$base/espn_data/qbr_week_level.csv.gz" qbr_week_level.csv 20 '$1 == "2025"'
get "$base/espn_data/qbr_season_level.csv.gz" qbr_season_level.csv 20 '$1 == "2025"'
get "$base/injuries/injuries_2025.csv.gz" injuries_2025.csv
get "$base/depth_charts/depth_charts_2024.csv.gz" depth_charts_2024.csv
get "$base/weekly_rosters/roster_weekly_2025.csv.gz" roster_weekly_2025.csv
get "$base/combine/combine.csv.gz" combine.csv
get "$base/pbp/play_by_play_2025.csv.gz" pbp_2025_game.csv 400 '$2 == "2025_01_DAL_PHI"'
get "$base/ftn_charting/ftn_charting_2025.csv" ftn_2025_game.csv 400 '$2 == "2025_01_DAL_PHI"'
get "$ff/ep_weekly_2025.csv" ep_weekly_2025.csv 20 '$5 != "NA"'
# Sleeper 2025 week 5: the first 20 player rows plus two DEF and two TEAM rows, without the embedded player object.
curl -s --compressed "https://api.sleeper.com/stats/nfl/2025/5?season_type=regular" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const rows = JSON.parse(s)
  const pos = (r) => (r.player || {}).position
  const pick = [
    ...rows.filter((r) => pos(r) !== "DEF" && pos(r) !== "TEAM").slice(0, 20),
    ...rows.filter((r) => pos(r) === "DEF").slice(0, 2),
    ...rows.filter((r) => pos(r) === "TEAM").slice(0, 2)
  ].map(({ player, ...r }) => r)
  process.stdout.write(JSON.stringify(pick, null, 1) + "\n")
})' > "$dir/sleeper_stats_2025_5.json"
wc -l "$dir"/*.csv "$dir"/*.json
