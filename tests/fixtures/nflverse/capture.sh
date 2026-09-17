#!/usr/bin/env bash
# Re-captures tests/fixtures/nflverse/*.csv from the live sources (first 50 data rows each).
# Usage: tests/fixtures/nflverse/capture.sh   (needs curl + gunzip; `head` closing the pipe is expected)
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL "$base/stats_player/stats_player_week_2025.csv.gz" | gunzip | head -n 51 > "$dir/stats_player_week.csv"
curl -sL "$base/stats_team/stats_team_week_2025.csv.gz" | gunzip | head -n 51 > "$dir/stats_team_week.csv"
curl -sL "$base/snap_counts/snap_counts_2025.csv.gz" | gunzip | head -n 51 > "$dir/snap_counts.csv"
curl -sL "$base/schedules/games.csv" | awk -F, 'NR == 1 || $2 == "2025"' | head -n 51 > "$dir/games.csv"
curl -sL https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv | head -n 51 > "$dir/db_playerids.csv"
wc -l "$dir"/*.csv
