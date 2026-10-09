# NFL stats catalog: every traditional and advanced stat, players and teams (compiled 2026-10-09)

Scope: a reference list of the NFL statistics that exist today. It covers
traditional box-score stats and advanced metrics, for both players and teams.
Each stat is tagged with where it can be obtained, measured against what this
app already ingests.

How this was checked. Column lists for the nflverse files were read from the
live files and data dictionaries on 2026-10-09: `stats_player`, `stats_team`,
`play_by_play` (372 fields), `nextgen_stats`, `pfr_advstats`, `ftn_charting`,
`pbp_participation` and `combine`. The 2025 Next Gen Stats additions come from
NFL.com's 2025 metrics article. PFF and ESPN definitions come from their
published glossaries and explainers. Definitions for the remaining proprietary
metrics are from domain knowledge and were not re-verified.

## Source tags

| Tag | Meaning |
|---|---|
| `app` | Already ingested by the app (nflverse `stats_player` / `stats_team` / `snap_counts` / `schedules`, see `src/main/sources/nflverse.ts:257`) |
| `drv` | Derivable from data the app already ingests (a ratio or formula over `app` columns) |
| `pbp` | Free, keyless: nflverse `play_by_play_{YYYY}` (2026 file live) |
| `ngs` | Free, keyless: nflverse `nextgen_stats` (`ngs_passing` / `ngs_rushing` / `ngs_receiving`; 2026 weeks present) |
| `pfr` | Free, keyless: nflverse `pfr_advstats` (`advstats_week_{pass,rush,rec,def}_{YYYY}`; 2026 live) |
| `ftn` | Free, keyless: nflverse `ftn_charting_{YYYY}` (2022+, 2026 live) |
| `part` | Free, keyless: nflverse `pbp_participation_{YYYY}` (2016–2025; **2026 not published yet**) |
| `comb` | Free, keyless: nflverse `combine.csv` |
| `paid` | Proprietary or paywalled, with no free bulk feed: PFF, FTN/DVOA, ESPN, Sports Info Solutions (SIS), Fantasy Points Data (FPD), PlayerProfiler, NFL Pro |

---

## Part 1: Player stats, traditional

Unless a tag is shown, these are `app` (counts) or `drv` (rates and averages).

### 1.1 Passing
- Completions, attempts, completion %, passing yards, passing TDs, interceptions
- Yards/attempt (Y/A), yards/completion, yards/game, TD %, INT %
- Sacks taken, sack yards lost, sack %, sack fumbles (and lost)
- Passing first downs, passing 2-pt conversions
- Long completion `pbp`; completions of 10+/16+/20+/40+ yards (`passing_10/16/20/40`)
- 300- and 400-yard games `drv`
- **Passer rating (NFL)** `drv`: a=(Cmp/Att−0.3)×5, b=(Y/A−3)×0.25,
  c=TD/Att×20, d=2.375−INT/Att×25. Clamp each to [0, 2.375].
  Rating = (a+b+c+d)/6×100.
- QB record as starter, 4th-quarter comebacks, game-winning drives `pbp`/`drv`
- Kneels, spikes `pbp`

### 1.2 Rushing
- Carries, rushing yards, yards/carry, yards/game, rushing TDs
- Rushing first downs, rushing 2-pt conversions, fumbles and fumbles lost
- Runs of 10+/12+/20+/40+ yards (`rushing_10/12/20/40`)
- Long run `pbp`; 100-yard games `drv`; scrambles vs. designed runs `pbp`

### 1.3 Receiving
- Targets, receptions, catch rate (rec/tgt), receiving yards, yards/reception,
  yards/target, yards/game, receiving TDs
- Receiving first downs, receiving 2-pt conversions, fumbles and fumbles lost
- Catches of 10+/16+/20+/40+ yards (`receiving_10/16/20/40`)
- Long reception `pbp`; 100-yard games `drv`

### 1.4 Scrimmage and all-purpose
- Touches (carries + receptions), yards from scrimmage, yards/touch `drv`
- All-purpose yards (scrimmage + return yards), total TDs `drv`

### 1.5 Ball security
- Fumbles (total, forced by opponent, not forced, out of bounds), fumbles lost
- Own and opponent fumble recoveries, recovery yards, recovery TDs

### 1.6 Individual defense
- Solo tackles, assisted tackles, combined tackles
- Tackles for loss (TFL) and TFL yards
- Sacks (half-sacks included), sack yards, QB hits
- Interceptions, INT return yards, pick-sixes, passes defended
- Forced fumbles, fumble recoveries, defensive TDs, safeties
- Blocked punts, blocked FGs, blocked PATs, defensive 2-pt returns
- Stuffs (run tackled at or behind the LOS) `pbp`

### 1.7 Kicking
- FG made/attempted, FG %, long, blocked
- FG made and missed by distance: 0–19, 20–29, 30–39, 40–49, 50–59, 60+
- Distance lists for made, missed and blocked kicks; game-winning FG made/att/distance
- PAT made/attempted/missed/blocked, PAT %
- Kickoffs, kickoff yards, touchbacks, touchback %, onside attempts and recoveries `pbp`
- Kicker points `drv`

### 1.8 Punting
- Punts, gross yards, gross average, long, blocked
- Net yards and net average, inside-20, touchbacks, fair catches, out of bounds, downed
- Punts returned, return yards allowed, return TDs allowed

### 1.9 Returns
- Kick returns and yards, punt returns and yards (both `app`); averages `drv`
- Return TDs (`special_teams_tds` covers all ST TDs), long return, punt fair catches, muffs `pbp`

### 1.10 Participation and discipline
- Games played; games started (rosters/depth charts, free)
- Offensive, defensive and special-teams snaps and snap % (`snap_counts`)
- Penalties and penalty yards; penalty type (holding, false start, DPI…) `pbp`

### 1.11 Fantasy scoring
- Fantasy points: standard and PPR `app`; half-PPR and custom league scoring `drv`
- Sleeper scoring keys the app already maps (`src/main/scoring/adapters.ts`).
  These include yardage-bucket bonuses (`rec_0_4`…`rec_40p`, `pass_cmp_40p`,
  `pass_td_40p/50p`), first-down points (`pass_fd`, `rec_fd`, `rush_fd`),
  DST events (`def_3_and_out`, `def_4_and_stop`, `def_forced_punts`) and
  points-allowed / yards-allowed tiers.
- Derived fantasy stats `drv`: points/game, points per snap, touch, target or
  opportunity; weekly standard deviation; boom/bust rate; top-12/24/36 weekly
  finish rate; positional rank.

### 1.12 Physical and athletic profile
- Combine `comb`: height, weight, 40-yard dash, bench reps, vertical, broad jump,
  3-cone, 20-yard shuttle. Draft round, pick and team.
- Not in nflverse `paid`/web: arm length, hand size, wingspan, 10/20-yard splits,
  60-yard shuttle.
- Composites: **Speed Score** = weight×200/40time⁴; height-adjusted speed score;
  **RAS** (Relative Athletic Score, 0–10); PlayerProfiler Burst / Agility /
  SPARQ-x; BMI.
- College production `paid`/web: dominator rating, breakout age, college target
  share, college YPRR.

---

## Part 2: Player stats, advanced

### 2.1 Expected points and win probability (all positions)
| Stat | What it measures | Source |
|---|---|---|
| EP | Expected points of the next score from the current down, distance and field position | `pbp` |
| EPA (total, per play) | Change in EP caused by the play | `app` (passing/rushing/receiving EPA), `pbp` |
| Air EPA / YAC EPA | EPA split into the throw and the run after the catch (also completed-only versions) | `pbp` |
| QB EPA | EPA credited to the QB, including scrambles and sacks | `pbp` |
| Success rate | % of plays with EPA > 0. Classic version: gain 40% of yards-to-go on 1st down, 60% on 2nd, 100% on 3rd/4th | `pbp` |
| WP / WPA | Win probability, and win probability added by the play (raw and Vegas-adjusted) | `pbp` |
| xYAC (mean, median, success, first down, EPA) | Expected YAC on a completion, and the value of that expected YAC | `pbp` |
| CP / CPOE | Completion probability, and completion % over expected | `app` (passing_cpoe), `pbp` |
| xPass / PROE | Probability the play is a pass, and pass rate over expected | `pbp` |
| Series success | Whether the series earned a first down or TD | `pbp` |
| Clutch / leverage-weighted EPA | EPA weighted by how much the situation swings WP | `drv` from `pbp` |

### 2.2 Quarterback efficiency and composites
| Stat | Definition | Source |
|---|---|---|
| ANY/A | (Yds + 20·TD − 45·INT − SackYds) / (Att + Sacks) | `drv` |
| NY/A | (Yds − SackYds) / (Att + Sacks) | `drv` |
| AY/A | (Yds + 20·TD − 45·INT) / Att | `drv` |
| Index stats (Rate+, ANY/A+, Cmp%+) | Indexed so league average = 100 (PFR style) | `drv` |
| PACR | Passing yards / air yards | `app` |
| EPA/dropback, dropback success rate | Dropbacks include sacks and scrambles | `pbp` |
| EPA+CPOE composite | rbsdm.com blend of EPA/play and CPOE | `drv` from `pbp` |
| Total QBR | ESPN 0–100 (50 = average); EPA with division of credit and clutch weighting | `paid` (ESPN, published free on site) |
| DVOA / DYAR / YAR | FTN: value per play over average, adjusted for situation and opponent; DYAR = total over replacement | `paid` (FTN) |
| PFF passing grade, PFF WAR | Play-by-play graded composite; wins above replacement | `paid` (PFF) |

### 2.3 Quarterback process and charting
| Stat | What it measures | Source |
|---|---|---|
| Time to throw | Seconds from snap to release | `ngs`, `part` |
| Aggressiveness | % of attempts into tight coverage (defender within 1 yd) | `ngs` |
| Intended air yards (aDOT) / completed air yards | Average depth of attempts / of completions | `ngs`, `app` (air yards) |
| Air yards differential | Intended minus completed air yards | `ngs` |
| Air yards to sticks | Average depth of throw relative to the first-down marker | `ngs` |
| Max completed air distance | Longest straight-line flight of a completion | `ngs` |
| xComp % | Expected completion % from tracking (Completion Probability 2.0 since 2025) | `ngs` |
| On-target %, bad-throw % | Charted accuracy | `pfr` |
| Adjusted completion % ("accuracy %") | Excludes spikes, throwaways, batted balls and hit-as-thrown passes; counts drops as completions | `paid` (PFF) |
| Big-time throws (BTT%), turnover-worthy plays (TWP%) | Charted throw quality | `paid` (PFF) |
| Interception-worthy pass | Charted per play | `ftn` |
| Catchable ball %, receiver drops, drop % | Charted per throw | `ftn`, `pfr` |
| Throwaways, spikes, batted balls | Counts | `pfr`, `ftn` |
| Pocket time | Average time in the pocket | `pfr` |
| Pressure faced: pressured %, times blitzed/hurried/hit | Charted pressure | `pfr`, `part` (was_pressure) |
| Pressure-to-sack rate (P2S), QB-fault sacks | How often pressure becomes a sack | `drv`/`ftn` |
| Splits: clean pocket vs. pressure, vs. blitz, by blitzer count | Efficiency in each situation | `ftn` + `pbp` |
| Play-action rate and efficiency | PA attempts and yards | `pfr`, `ftn` |
| RPO plays/yards (pass and run parts) | RPO usage and output | `pfr`, `ftn` |
| Screen rate, out-of-pocket rate, no-huddle, shotgun/pistol/under center | Charted context | `ftn`, `pbp` |
| Read thrown | 1st read / 2nd / 3rd+ / checkdown / designed / scramble drill | `ftn` |
| Deep-ball stats (20+ air yards) | Att, comp %, yards, TD/INT | `pbp` |
| Scramble rate and scramble yards; designed rushes; QB sneaks | QB running profile | `pbp`, `ftn` |

### 2.4 Rushing advanced
| Stat | What it measures | Source |
|---|---|---|
| Yards before contact (total, per att) | Blocking-driven yards | `pfr` |
| Yards after contact (total, per att) | Runner-driven yards | `pfr` |
| Broken tackles (rush and rec) | Charted | `pfr` |
| Missed tackles forced (MTF), MTF/att | Charted (PFF definition) | `paid` (PFF) |
| Elusive Rating | (MTF_rush+rec)/(rushes+receptions) × (YCO/att × 100) | `paid` (PFF) |
| Expected rushing yards, RYOE, RYOE/att, rush % over expected | Tracking-based expectation and the gain over it | `ngs` |
| Efficiency | Distance the runner travelled per rushing yard (low = north/south) | `ngs` |
| 8+ defenders in box %, box count | Run difficulty | `ngs`, `ftn`, `part` |
| Time to LOS | Time behind the line before crossing | `ngs` |
| Rush EPA/att, rush success rate | Value per carry | `app` (EPA), `pbp` |
| Stuff rate | % of carries stopped at or behind the LOS | `pbp` |
| Explosive run rate (10+/15+/20+), breakaway % | Big-play share | `app` (10/12/20/40 counts), `pbp` |
| First-down rate per carry | Chains moved | `drv` |
| Run direction and gap splits | `run_location` (L/M/R), `run_gap` (end/tackle/guard) | `pbp` |
| Gap vs. zone scheme splits | Scheme-specific efficiency | `paid` (PFF, SIS) |
| Max speed (mph) | Top ball-carrier speed | `paid` (NGS site / NFL Pro) |

### 2.5 Receiving advanced
| Stat | What it measures | Source |
|---|---|---|
| aDOT (average depth of target) | Air yards / targets | `drv`, `ngs` |
| Air yards, air yards share | Raw and team share of intended air yards | `app` |
| RACR | Receiving yards / air yards | `app` |
| YAC, YAC/rec | Yards after catch | `app` |
| xYAC, YAC over expected | Tracking-based expected YAC and the gain over it | `ngs`, `pbp` |
| Separation | Yards to nearest defender at catch or incompletion | `ngs` |
| Cushion | Yards to the defender across from him at the snap | `ngs` |
| Tight-window %, catch rate over expected (CROE) | Coverage tightness and catching skill | `paid` (NGS site / NFL Pro) |
| Drops, drop rate | Charted | `pfr`, `ftn` |
| Contested targets, contested catch rate | Charted | `ftn` (flag), `paid` (PFF) |
| Created receptions | Catches made only because of an exceptional receiver play | `ftn` |
| Catchable-target % | Share of targets that were catchable | `ftn` |
| Passer rating and INTs when targeted | QB output on this player's targets | `pfr` |
| Receiving EPA/target, success rate/target | Value per target | `app`, `pbp` |
| Alignment (slot / wide / inline / backfield rate) | Where he lines up | `paid` (PFF, FPD) |
| Route tree breakdown | Share of go, slant, out, screen… routes | `paid`; `part` covers the targeted receiver only |
| Man vs. zone splits (TPRR/YPRR) | Coverage-specific production | `paid`; `part` has coverage type on targets |
| ESPN Open / Catch / YAC / Overall score | 0–99 receiver tracking metrics (50 = average) | `paid` (ESPN) |

### 2.6 Usage and opportunity (fantasy core)
| Stat | Definition | Source |
|---|---|---|
| Snap share | Player snaps / team offensive snaps | `app` |
| Target share | Targets / team targets | `app` |
| WOPR | 1.5·target share + 0.7·air-yards share | `app` |
| Carry share, opportunity share | Carries (+ targets) / team totals | `drv` |
| Routes run, route participation | Routes / team dropbacks | `paid` (FPD, PFF); `part` gives a proxy (on field for dropbacks) |
| TPRR, YPRR | Targets per route run; yards per route run | `paid`; proxy from `part` |
| First-read target share, first-read TPRR | Share of first-read looks | `paid` (FPD); `ftn` `read_thrown` gives team-level |
| Red-zone, inside-10 and inside-5 carries and targets; end-zone targets | High-leverage opportunity | `pbp` |
| High-value touches (HVT) | Targets + carries inside the 10 (RB) | `pbp` |
| Weighted opportunity / expected fantasy points (XFP) and points over expected (FPOE) | Each carry and target valued by its expected fantasy yield | `drv` from `pbp`; `paid` (FPD) |
| Two-minute and long-down-and-distance snap share, short-yardage share | RB role splits | `drv` from `part`; `paid` (FPD) |
| Unrealized air yards | Air yards not converted into yards | `drv` |

### 2.7 Pass rush
| Stat | What it measures | Source |
|---|---|---|
| Pressures = sacks + QB hits + hurries | Total disruption | `pfr` (pressures, hurries, hits) |
| Pass-rush snaps, pressure rate | Pressures per pass-rush snap | `paid` (PFF); `part` (rusher count only) |
| Pass Rush Productivity (PRP) | (Sacks + 0.75·(hits + hurries)) / pass-rush snaps × 100 | `paid` (PFF) |
| Pass Rush Win Rate (PRWR) | % of rushes that beat the block within 2.5 s | `paid` (ESPN) |
| Double-team rate | % of rushes facing two blockers | `paid` (ESPN) |
| Get-off time, time to pressure, sack rate | Tracking-based rush speed | `paid` (NGS site / NFL Pro) |
| True-pass-set pressure rate / win rate | Excludes play action, screens and quick throws | `paid` (PFF) |
| Sacks per pressure, unblocked pressures | Finishing; free rushers | `drv`/`paid` |
| Times blitzed (LB/DB) | Blitz usage | `pfr` |

### 2.8 Coverage
| Stat | What it measures | Source |
|---|---|---|
| Targets, completions, comp % allowed, yards allowed, TDs allowed | Results when targeted | `pfr` |
| Yards/target, yards/completion allowed, passer rating allowed | Efficiency allowed | `pfr` |
| aDOT allowed, air yards allowed, YAC allowed | Depth and run-after allowed | `pfr` |
| INTs, passes defended, forced-incompletion rate | Ball production | `app`, `drv` |
| Coverage snaps, yards/coverage snap, snaps per target or reception | Volume-adjusted coverage | `paid` (PFF) |
| Man vs. zone, slot vs. wide splits | Coverage-type splits | `paid` (PFF, SIS) |
| Coverage Responsibility (2025) | Transformer model: each defender's assignment and who is accountable for a target | `paid` (NGS / NFL Pro) |

### 2.9 Run defense and tackling
| Stat | What it measures | Source |
|---|---|---|
| Run stops, run-stop % | Tackles that count as an offensive failure | `paid` (PFF) |
| Run Stop Win Rate (RSWR) | Beats a block, disrupts the lane, or tackles within 3 yards | `paid` (ESPN) |
| TFL, average depth of tackle | Penetration | `app`, `pbp` |
| Missed tackles, missed-tackle % | Tackling reliability | `pfr` |
| Tackling efficiency | Tackle attempts per miss | `paid` (PFF) |
| Tackle probability (2024) | Live probability of a successful tackle; flags missed tackles | `paid` (NGS) |

### 2.10 Offensive line
| Stat | What it measures | Source |
|---|---|---|
| Sacks, hits, hurries and pressures allowed; pressure rate allowed | Pass-pro results | `paid` (PFF, SIS) |
| Pass Blocking Efficiency | 100 − (sacks + 0.75·(hits + hurries)) / pass-block snaps × 100 | `paid` (PFF) |
| Pass Block Win Rate (PBWR) | Block held 2.5 s or longer | `paid` (ESPN) |
| Run Block Win Rate (RBWR) | Mirror image of RSWR | `paid` (ESPN) |
| Blown blocks (pass and run) | Charted | `paid` (SIS) |
| Chip blocks (2025) | Eligible receiver chips an edge rusher before releasing | `paid` (NGS) |
| Penalties (holding, false start) | Discipline | `pbp` |
| PFF pass-block and run-block grades | Graded composite | `paid` (PFF) |

### 2.11 Special teams advanced
| Stat | What it measures | Source |
|---|---|---|
| FG % over expected / FG points added | Make rate against a distance and conditions model | `drv` from `pbp` |
| Kicker and punter EPA | EP value of kicks | `pbp` |
| Punt net average, inside-20 rate, touchback rate | Field-position value | `app`/`drv` |
| Punt hang time | Coverage time | `paid` |
| Expected return yards, return yards over expected (2022) | Tracking-based return value | `paid` (NGS) |
| Kickoff landing zone %, return rate (dynamic-kickoff era, 2024+) | New-rule kickoff profile | `pbp` |
| Special-teams DVOA | Opponent-adjusted ST value | `paid` (FTN) |

### 2.12 All-in-one ratings
- PFF grades (overall plus each facet), PFF WAR / WAA `paid`
- DVOA / DYAR / YAR, also split by down, red zone, and target or carry type `paid` (FTN)
- Total QBR `paid` (ESPN)
- Approximate Value (AV): PFR's single season-value number, free on the web (not in nflverse)
- ESPN Receiver Tracking Metrics overall score `paid`

### 2.13 Tracking and model outputs from Next Gen Stats
Much of this is not in the free `ngs` files; it lives on nextgenstats.nfl.com and NFL Pro.
- Ball-carrier max speed, fastest plays, distance travelled
- Completion Probability 2.0 (2025), with occlusion-aware separation and QB-to-throw-path features
- Coverage classification (man/zone and shell, 2022), Coverage Responsibility (2025),
  coverage disguise (split-safety look rotating to single-high/Cover 0, 2025)
- Motion types: 19 labels including jet, orbit, fly, glide and exit (2025)
- Chip-block model, tackle probability, expected return yards
- Expected possessions remaining (2025), live win probability

---

## Part 3: Team stats, traditional

### 3.1 Results and standings
- W-L-T, win %, points for and against, point differential `app` (schedules)
- Home/away, division and conference records; streak; record in one-score games `drv`
- Strength of schedule (opponent win %), strength of victory, record vs. .500+ teams `drv`
- Playoff seed, clinch and elimination status, tiebreakers `drv`
- Against-the-spread and over/under records `drv` (schedules carry spread, total and moneylines)

### 3.2 Team offense
- Points/game, total yards, yards/game, plays, yards/play `drv`
- Passing: cmp/att/yds/TD/INT, sacks allowed, net yards/attempt `app`
- Rushing: att/yds/YPC/TD `app`
- First downs: total and by pass, rush and penalty `app`/`pbp`
- 3rd-down and 4th-down conversion % `pbp`
- Red-zone trips, TDs, TD % and scoring %; goal-to-go TD % `pbp`
- Giveaways (INT + fumbles lost) `app`
- Time of possession `pbp` (drive time)
- Penalties and penalty yards `app`; timeouts used `app`

### 3.3 Team defense
- Points, yards (total, pass, rush), yards/play and first downs allowed `drv`/`pbp`
- 3rd- and 4th-down stop %, red-zone TD % allowed `pbp`
- Takeaways (INT, fumble recoveries), turnover margin `app`/`drv`
- Sacks, sack %, QB hits, TFL, defensive TDs, safeties, blocked kicks `app`
- Three-and-outs forced, 4th-down stops, forced punts (Sleeper DST keys) `pbp`
- Fantasy DST tiers: points allowed (0 / 1–6 / 7–13 / 14–20 / 21–27 / 28–34 / 35+) and yards-allowed tiers `drv`

### 3.4 Team special teams
- FG and PAT %, punt gross and net average, KR and PR averages, return TDs `app`/`drv`
- Kickoff touchback %, blocked kicks for and against `pbp`
- Average starting field position, own and opponent `pbp`

### 3.5 Drive stats
- Drives, plays/drive, yards/drive, time/drive, points/drive `pbp`
- Average drive start, % of drives scoring, % ending in a turnover, punts/drive, three-and-out % `pbp`

---

## Part 4: Team stats, advanced

### 4.1 Efficiency
| Stat | Definition | Source |
|---|---|---|
| EPA/play (offense and defense; pass and rush; by down) | Average EPA | `pbp` |
| Success rate (offense and defense; pass and rush) | % of plays with EPA > 0 | `pbp` |
| Early-down EPA, late-down conversion rate | Split by down | `pbp` |
| Explosive play rate | 10+ yard runs, 20+ yard passes (or 15+ / 20+) | `pbp` |
| Havoc rate (defense) | (TFL + forced fumbles + INT + passes defended) / plays | `drv` |
| Stuff rate, adjusted line yards, power success, second-level / open-field yards | Run-blocking quality; ALY weights each carry's yards (losses ×1.2, 0–4 ×1, 5–10 ×0.5, 11+ ×0) | `drv` from `pbp`; `paid` (FTN, opponent-adjusted) |
| Adjusted sack rate | Sacks + intentional grounding per pass play, adjusted for situation and opponent | `paid` (FTN) |
| Drive success rate, available yards % | % of series earning a first down or TD; yards gained / yards available | `paid` (FTN); `drv` from `pbp` |
| Points/drive, EPA/drive | Drive value | `pbp` |
| Red-zone EPA and TD % | Finishing | `pbp` |

### 4.2 Tendencies and scheme
| Stat | What it measures | Source |
|---|---|---|
| PROE, neutral-situation pass rate, early-down pass rate | Pass/run lean beyond game script | `pbp` |
| Neutral pace (seconds/play), plays/game, no-huddle rate | Tempo, a key fantasy volume driver | `pbp` |
| Shotgun / pistol / under-center rate | QB alignment | `pbp`, `ftn` |
| Motion rate and motion types | Pre-snap movement | `ftn`; `paid` (NGS types) |
| Play-action, RPO, screen and trick-play rates | Play design | `ftn` |
| Personnel usage (11 / 12 / 21 / 13…), formations | Offensive groupings | `part` |
| Defensive personnel (base / nickel / dime), box count | Defensive groupings | `part`, `ftn` |
| Blitz rate, pass rushers per dropback, 4-man pressure rate | Pressure strategy | `ftn`, `part` |
| Man vs. zone rate; coverage shell (Cover 0/1/2/3/4/6, 2-man) | Coverage tendencies | `part` |
| Single-high vs. two-high rate, disguise rate | Shell and disguise | `part`; `paid` (NGS) |
| 4th-down aggressiveness (go rate vs. model), 2-pt decisions | Coaching decisions | `drv` from `pbp` |

### 4.3 Opponent-adjusted ratings and power ratings
| Stat | What it measures | Source |
|---|---|---|
| DVOA (total, offense, defense, ST), weighted DVOA, DAVE, estimated wins, variance, schedule strength | FTN's opponent-adjusted efficiency suite | `paid` (FTN) |
| SRS, MOV, OSRS, DSRS, SOS | PFR's simple rating system: MOV + SOS | `drv` |
| ESPN FPI (offense, defense, ST), playoff and Super Bowl odds | ESPN's predictive rating | `paid` (ESPN, published free) |
| Elo (nfelo, 538 historical) | Rating from game results | free web / `drv` |
| Pythagorean wins | PF^2.37 / (PF^2.37 + PA^2.37) × games | `drv` |
| Expected wins (from EPA or point differential), one-score luck | Over- or under-performance | `drv` |
| Turnover luck: fumble recovery %, INT rate vs. TWP rate, dropped INTs | Non-repeatable variance | `drv` from `pbp`; `ftn` |
| ESPN team PRWR, RSWR, PBWR, RBWR | Trench win rates | `paid` (ESPN) |
| Adjusted Games Lost (AGL) | Injury impact, weighted by starter value | `paid` (FTN) |

### 4.4 Context and market
- Vegas: spread, total, moneylines, implied team totals, closing-line movement `app` (schedules) / `drv`
- Rest days, rest differential, travel, divisional game, roof, surface, temperature, wind,
  referee, coaches `app` (schedules), `pbp`
- Expected possessions remaining (2025) `paid` (NGS)

### 4.5 Fantasy matchup stats (team level)
- Fantasy points allowed by position (DvP), raw and adjusted for opponent averages `drv`
- Target-funnel vs. run-funnel defenses (pass/rush share of yards allowed vs. league) `drv`
- Team volume: plays, pass and rush attempts per game, red-zone plays/game `drv`/`pbp`
- Implied team total (Vegas) `drv`

---

## Part 5: Source summary

| Source | Access | Coverage |
|---|---|---|
| nflverse `stats_player`, `stats_team`, `snap_counts`, `schedules` | Free, already ingested | Traditional box score, EPA, CPOE, target/air-yards share, WOPR, RACR/PACR, kicking/punting detail, snaps, Vegas lines, weather |
| nflverse `play_by_play` | Free (372 fields) | EP/EPA/WPA, success, xYAC, CP/CPOE, xPass/PROE, drives, down/distance, red zone, penalties |
| nflverse `nextgen_stats` | Free | NGS passing (time to throw, aggressiveness, CPOE…), rushing (RYOE, efficiency, box %, time to LOS), receiving (separation, cushion, xYAC) |
| nflverse `pfr_advstats` | Free | Drops, bad throws, pressure faced, play action, RPO, YBC/YAC, broken tackles, coverage allowed, missed tackles, pressures |
| nflverse `ftn_charting` | Free (2022+) | Play action, RPO, screen, motion, read thrown, catchable/contested/created/drop, INT-worthy, blitzers |
| nflverse `pbp_participation` | Free (through 2025) | Personnel, formation, players on field, coverage type, man/zone, route of targeted receiver, time to throw, pressure |
| nflverse `combine` | Free | Measurables and drills |
| PFF | Paid | Grades, WAR, routes, YPRR, pressures by player, PRP, run stops, missed tackles, BTT/TWP |
| FTN (DVOA) | Paid (partial free) | DVOA, DYAR, ALY, ASR, AGL, drive stats |
| ESPN | Free to read, no feed | Total QBR, FPI, win rates, receiver tracking metrics |
| Fantasy Points Data | Paid | Routes, TPRR, YPRR, first-read share, XFP, alignment, man/zone splits |
| NFL Pro / NGS site | Paid / web | Full tracking suite, including the 2024–2025 models |
| PlayerProfiler | Freemium | Athletic composites, college dominator, juke rate, target quality |
| Pro-Football-Reference | Free web (blocks bots) | Traditional stats, AV, SRS, index stats, drive stats |
| rbsdm.com, nfelo | Free web | EPA+CPOE composite, Elo ratings |

## Part 6: Gaps relative to the app (notes, not a plan)

- **Free and fantasy-predictive, not yet ingested:**
  - Red-zone / inside-10 / goal-line opportunities, HVT and expected fantasy points (all from `pbp`)
  - RYOE, separation and xYAC (`ngs`)
  - YBC/YAC, broken tackles and drops (`pfr`)
  - Pace and PROE (`pbp`)
- **Routes run, TPRR and YPRR** are the most predictive receiver usage stats and are paid-only.
  The closest free proxy is "on field for team dropbacks" from `pbp_participation`.
  That file has no 2026 season yet, so the proxy only works for history.
- Trench stats (PRWR/PBWR), coverage grades and PFF grades have no free bulk source.
