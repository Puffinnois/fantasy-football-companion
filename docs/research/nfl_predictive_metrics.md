# NFL predictive metrics: a sourced catalogue

Research date: **15 October 2026**

This catalogue covers publicly documented NFL forecasting systems, statistical indicators used in forecasts, and models that predict individual play outcomes. It includes free, subscription, restricted-data, and research-only options, and labels them accordingly.

**It is not possible to list literally every NFL predictive metric.** Teams and vendors maintain private models, and researchers continually introduce new variants. This document covers the principal documented families and named metrics identified in the research; it does not claim that every entry has demonstrated predictive superiority.

## How to read the catalogue

The word *predictive* is often applied to several different kinds of measures:

| Label | Meaning | Example |
| --- | --- | --- |
| **Forecast** | Explicitly estimates a future game, season, player outcome, or future performance level. | FPI, QB Elo, QBASE, fantasy projections. |
| **Indicator** | Measures observed performance, role, or characteristics that can enter a forecast. It is not itself a prediction of next season. | CPOE, YPRR, target share. |
| **Play model** | Predicts an outcome conditional on information available at a particular point in a play or game. | Completion probability, expected rushing yards. |
| **Evaluation** | Assigns value to completed performance. Inclusion does not establish future predictive accuracy. | WAR, DYAR, WPA. |

An **over-expected** statistic is usually an evaluation or indicator derived from a play model. For example, RYOE compares actual rushing yards with a modeled baseline; it does not directly forecast next year's rushing yards.

Access labels:

- **Free:** public tables, articles, or published outputs.
- **Open:** public code/data, or a calculation reproducible from public inputs.
- **Paid:** subscription data or projections; some examples may be free.
- **Restricted:** the full inputs or outputs are not generally downloadable by the public.
- **Research/historical:** a paper, prototype, or historical implementation rather than a verified current production leaderboard.

Access is described at the product or method level. A public explanation does not imply a free historical database, API, or downloadable forecast archive. Numbered source links work in ordinary Markdown readers.

## Contents

1. [Team strength and game forecasting](#1-team-strength-and-game-forecasting)
2. [Quarterbacks](#2-quarterback-forecasting-and-evaluation)
3. [General efficiency and player value](#3-general-efficiency-and-player-value-metrics)
4. [Receiving](#4-receiving-wrs-tes-and-receiving-backs)
5. [Running backs and fantasy opportunity](#5-running-backs-and-fantasy-opportunity)
6. [Offensive line, pass rush, and defense](#6-offensive-line-pass-rush-and-defense)
7. [Individual plays and special teams](#7-models-for-individual-plays-game-states-and-special-teams)
8. [Draft prospects](#8-draft-prospects-and-early-career-forecasts)
9. [Research and other forecasts](#9-research-models-and-additional-forecasting-outputs)
10. [Common statistical inputs](#10-common-inputs-that-should-not-be-mistaken-for-prediction-systems)
11. [Published predictive evidence](#11-what-the-cited-research-actually-establishes)
12. [Matching metrics to questions](#12-finding-the-right-category-for-a-question)

## 1. Team strength and game forecasting

| Metric / system | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **ESPN Football Power Index — FPI** | Predictive team strength in points relative to average; drives game and season probabilities. [1] | Forecast; free outputs, proprietary model. |
| **FTN projected DVOA** | Forecasts future team efficiency, separately from already-observed DVOA. Preseason projections incorporate roster and other contextual assumptions; resulting ratings support season simulations and playoff odds. [2] | Forecast; free previews and paid detail. |
| **DAVE — DVOA Adjusted for Variation Early** | Blends preseason expectations with current-season performance. Early results therefore do not completely replace the prior forecast; the blend changes as more games are played. [2], [3] | Forecast-oriented rating; FTN free/paid. |
| **nfelo team rating** | An NFL adaptation of Elo used to generate team ratings, spreads, and win probabilities. Its implementation includes quarterback and game-context adjustments; market-informed outputs should be distinguished from independent model estimates. [4] | Forecast; free/open. |
| **Weighted EPA — WEPA** | Reweights EPA according to play context to improve its forecasting usefulness. Robby Greer's implementation is a named model, not simply another name for average EPA or recency-weighted EPA. [5] | Forecast-oriented indicator; open. |
| **Massey–Peabody ratings** | Cade Massey and Rufus Peabody's system estimates underlying team strength for forecasting matchups using adjusted on-field performance. It is distinct from Kenneth Massey's ratings below. [6] | Forecast; published methodology discussions; detailed access varies. |
| **Massey Ratings** | Kenneth Massey's computer-rating system publishes NFL ratings and matchup predictions, accounting for who teams played. Ratings are inputs to predictions rather than win-loss standings. [7] | Forecast; free published outputs. |
| **Simple Rating System — SRS** | Combines scoring margin with opponent strength, expressed in points relative to average. A historical team-strength estimate that can serve as a forecasting baseline; it is not automatically a roster-adjusted future projection. [8] | Indicator; free/open. |
| **Pythagorean expected wins / winning percentage** | Estimates the record implied by points scored and allowed. It helps distinguish the scoring profile from the actual record; “expected wins” here describes that profile, not a direct remaining-season win forecast. [8] | Indicator; free/open. |
| **DVOA — Defense-adjusted Value Over Average** | Compares play efficiency with a situational, opponent-adjusted league baseline. There are overall, offense, defense, special-teams, and player versions. Positive offensive DVOA is better; more-negative defensive DVOA is better. [3] | Indicator/evaluation; FTN free/paid. |
| **Weighted DVOA** | Gives older games progressively less influence, describing more recent team performance. Different from DAVE, which incorporates preseason projections. [9] | Indicator; FTN free/paid. |
| **Model-derived win totals, playoff odds, division odds, Super Bowl odds** | Outputs from simulating future games using a strength model and schedule. They are forecasts, but they are not independent metrics when all come from the same underlying model. [1], [2], [4] | Forecast; provider-dependent. |

**Important distinction:** ordinary DVOA, projected DVOA, weighted DVOA, and DAVE answer different questions. Their names should not be used interchangeably.

## 2. Quarterback forecasting and evaluation

| Metric / system | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **nfelo QB Elo / QB value** | Maintains a quarterback-strength estimate intended for future prediction. Includes passing and rushing information and expresses performance relative to league context. Its current implementation continues work associated with FiveThirtyEight's earlier QB model. [10] | Forecast; free/open. |
| **DAKOTA / predictive EPA–CPOE composite** | Combines EPA and completion percentage over expected into a prediction-oriented quarterback rating. It is not a full multi-year career trajectory model. Historical nflfastR implementations exist; current documentation says `dakota` is not implemented in the newer stats calculation. [11], [68] | Forecast-oriented rating; historical/open, version-dependent availability. |
| **Unexpected Points Bayesian QB rankings** | Kevin Cole's evolving quarterback-strength estimates combine prior information with new performance. The documented update incorporates Adjusted Quarterback Efficiency. This is different from ranking quarterbacks solely by their current-season EPA. [12] | Forecast; free excerpts/paid outputs. |
| **Adjusted Quarterback Efficiency — AQE** | Kevin Cole's adjustment of EPA for factors such as drops, interception-worthy throws, protection, opponent strength, receivers, YAC, and weather. Intended to isolate quarterback performance; the underlying assumptions and model version matter. [13] | Indicator feeding forecasts; free methodology/paid outputs. |
| **Completion Percentage Over Expected — CPOE** | Completion percentage minus its modeled expectation. Tracking-based and play-by-play versions use different inputs; compare like with like. [14], [73] | Indicator derived from a play model; free/open or restricted by version. |
| **QB EPA per dropback / QB-adjusted EPA** | Average expected-points change on quarterback plays. Some implementations alter attribution—for example, nflfastR's `qb_epa` adjusts treatment of receiver fumbles. “Adjusted EPA” is not a universal formula; identify the provider. [15] | Indicator/evaluation; free/open. |
| **ESPN Total QBR** | Context-adjusted, EPA-based evaluation of quarterback contributions. [16] | Evaluation/indicator; free leaderboard, proprietary formula. |
| **Adjusted Net Yards per Attempt — ANY/A** | Passing efficiency incorporating touchdowns, interceptions, sacks, and sack yardage. The standard formula is `(pass yards + 20×pass TD − 45×INT − sack yards) / (attempts + sacks)`. It excludes QB rushing production. [8] | Indicator; free/open. |
| **PFF passing grade** | Film-based evaluation of the quarterback's contribution, including execution that box-score outcomes can obscure. PFF publishes research and claims concerning its predictive usefulness; the observed grade remains an evaluation of past plays. [17], [18] | Indicator/evaluation; paid, with free article examples. |
| **Big-Time Throw rate — BTT%** | Frequency of PFF's positively graded, high-value throws. Measures a different component of performance from completion rate or touchdown rate. [18] | Indicator; paid. |
| **Turnover-Worthy Play rate — TWP%** | Frequency of plays PFF judges to put the ball at substantial turnover risk. Can include dangerous throws that defenders drop and ball-security errors; actual turnovers are different outcomes. [18] | Indicator; paid. |
| **Adjusted completion percentage** | Credits drops and removes specified noncompetitive or disrupted attempts from the completion calculation. Unlike CPOE, it is not a throw-by-throw difficulty model. [19] | Indicator; PFF paid. |
| **On-target percentage / charted accuracy** | Share of qualifying throws judged accurately located. SIS studies on-target percentage separately from whether the receiver ultimately completed the catch. Charting definitions and eligible attempts matter. [20] | Indicator; SIS paid/free research. |
| **Independent Quarterback Rating — IQR** | SIS's modification of passer rating to account for events outside the passer's control, including drops, dropped interceptions, and throwaways. It should not be equated with Total QBR. [20] | Indicator/evaluation; paid/free examples. |
| **Pressure-to-sack rate — P2S%** | Sacks divided by pressured dropbacks. Describes how frequently pressure becomes a sack. The denominator depends on the provider's pressure definition. [19] | Indicator; paid charting, some free tables. |
| **Clean-pocket / under-pressure performance splits** | EPA, accuracy, grade, or other metrics computed separately with and without pressure. These are families of splits, not a new standalone metric; their sample sizes and predictive behavior differ. [19] | Indicators; provider-dependent. |
| **NGS Passing Score** | NFL/AWS composite evaluating passing execution against modeled play expectations. Amazon describes tracking-based yardage-distribution modeling behind the score. It evaluates passing performance; it is not a direct next-season development forecast. [21] | Evaluation/indicator; public examples, restricted full inputs. |

Do not assume a high passing-efficiency rating means a high fantasy projection: rushing opportunities and the scoring system also matter. Fantasy Points' published QB analysis distinguishes rushing volume and prior fantasy scoring from other inputs. [22]

## 3. General efficiency and player-value metrics

| Metric / family | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **Expected Points — EP** | Estimates the scoring value of a game state from down, distance, field position, and other model inputs. It is the baseline used to calculate EPA. [14] | Play/game-state model; open implementations. |
| **Expected Points Added — EPA; EPA/play** | Change in expected scoring value attributable to a play, accounting for points scored. Per-play averages describe efficiency. Offensive, defensive, passing, rushing, and net EPA are different aggregations of this framework. [23] | Indicator/evaluation; free/open. |
| **Success rate — SR** | Usually the percentage of plays with positive EPA in modern public analytics. Other providers use down-and-distance yardage thresholds, so two “success rates” may differ. [23] | Indicator; free/open. |
| **PFF overall and facet grades** | Evaluations covering passing, rushing, receiving, blocking, pass rush, run defense, coverage, and special teams. Position-specific rubrics mean grades are not interchangeable with positional value or wins added. [17] | Indicator/evaluation; paid. |
| **PFF Wins Above Replacement — WAR** | Converts player evaluation and participation information into estimated wins relative to replacement-level play. Covers positional value; season WAR is retrospective unless explicitly projected forward. [24] | Evaluation; paid/proprietary data, public research. |
| **nflWAR** | Yurko, Ventura, and Horowitz's reproducible framework uses multilevel models to estimate offensive skill-player contributions, with uncertainty estimates. The published framework is not a continuously updated public career forecast. [25] | Evaluation/research; open methodology. |
| **SIS Total Points / Points Earned / Points Saved** | Allocates play value across players using charting and expected-points concepts. Role and participation affect totals; per-play versions answer a different question. Its methodology has been updated over time. [26] | Evaluation/indicator; paid/free examples. |
| **DYAR — Defense-adjusted Yards Above Replacement** | FTN's cumulative player-value measure above a replacement baseline, expressed in adjusted yards. Unlike a rate statistic, it rewards additional productive volume. Not itself a future-yardage projection. [3] | Evaluation; FTN paid/free examples. |

## 4. Receiving: WRs, TEs, and receiving backs

| Metric / family | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **Yards per Route Run — YPRR** | Receiving yards divided by routes run. Includes routes without targets, combining target earning and production after being targeted. PFF has studied its relationship with future fantasy scoring. [27] | Indicator; PFF, Fantasy Points and other charting providers, usually paid. |
| **Targets per Route Run — TPRR / target rate** | Targets divided by routes. Separates target frequency while running routes from how often a receiver gets on the field. [28] | Indicator; paid charting/free selected tables. |
| **Target share** | Player targets as a share of the team's eligible targets. Measures involvement, with games and denominator definitions needing consistency. [29] | Indicator; free/open. |
| **Route participation** | Percentage of team passing opportunities on which the player runs a route. Especially relevant when snaps include substantial blocking work. [28] | Indicator; usually paid charting. |
| **Air yards / air-yards share** | Measures depth of intended targets and the player's share of the team's total. Includes unsuccessful targets; it describes downfield opportunity rather than yards already gained. [29] | Indicator; public play-by-play or vendor data. |
| **Weighted Opportunity Rating — WOPR** | Combines target share and air-yards share. The documented nflverse convention is `1.5 × target share + 0.7 × air-yards share`, with shares as fractions. It summarizes opportunity, not guaranteed future points. [29] | Indicator; free/open. |
| **Average Depth of Target — aDOT** | Average air-yard depth of targets. Describes receiving role and throw difficulty; higher is not automatically better because target volume and completion probability also change. [73] | Indicator/context; free/open. |
| **ESPN Open Score** | Tracking-based evaluation of getting open, including routes that do not receive a target. It measures a different aspect of receiving from target-only separation. [30] | Indicator; free scores, restricted tracking/model. |
| **ESPN Catch Score** | Evaluates catch performance against tracking-based expectations, with pass-accuracy adjustments. It is not simply raw catch percentage. [30] | Indicator/evaluation; free scores, proprietary model. |
| **ESPN YAC Score** | Evaluates yards gained after the catch relative to the modeled opportunity available at the catch. [30] | Indicator/evaluation; free scores, proprietary model. |
| **ESPN Overall Receiver Score** | Combines Open, Catch, and YAC components. A summary of evaluated receiving performance, not an explicit future-season stat line. [30] | Indicator/evaluation; free scores. |
| **Average Separation Score — ASS; route win rate** | Fantasy Points' charted assessment of whether and how effectively receivers separate. Its scoring process differs from measuring physical separation at a catch point. [31] | Indicator; paid, with public explainers. |
| **Reception Perception Success Rate vs. Coverage — SRVC** | Matt Harmon's route-charting framework measures success against man, zone, press, double coverage, and individual route types, including untargeted routes. Its samples and charting rules differ from tracking-based scores. [32] | Indicator; paid/free profiles and research. |
| **First downs per Route Run — 1D/RR** | Receiving first downs divided by routes. Measures the frequency of productive chain-moving outcomes without giving a very long reception proportionally more credit than a shorter first down. [33] | Indicator; Fantasy Points and computable charting combinations. |

**Avoid treating these as independent votes.** YPRR, TPRR, target share, WOPR, and fantasy points share underlying plays and opportunities. Four favorable readings can reflect overlapping information.

## 5. Running backs and fantasy opportunity

| Metric / family | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **Expected Fantasy Points — xFP / XFP / EP** | Assigns baseline fantasy value to observed opportunities and context. Useful for separating workload from realized scoring. It is not automatically a forecast of the next game; “EP” here must not be confused with football Expected Points. [71] | Indicator derived from opportunity models; free/paid versions. |
| **Fantasy Points Over Expected — FPOE** | Actual fantasy points minus expected fantasy points under the chosen xFP model. Measures conversion above or below that baseline; it does not establish that the difference will repeat. [71] | Indicator/evaluation; provider-dependent. |
| **Weighted opportunities / weighted touches** | Weights different opportunities by their scoring value, usually distinguishing targets from carries. The coefficients depend on the scoring format and implementation. [71] | Indicator; free explanations/paid data. |
| **Expected touchdowns — xTD** | Models baseline touchdown production from opportunities, often using field position and play type. A difference between TD and xTD measures over/underperformance relative to that model, not an obligation for future results to “catch up.” [28] | Indicator/play model; provider-dependent. |
| **Fantasy Life Utilization Score** | A 0–100 composite of role and production for RBs, WRs, and TEs. Includes opportunities, shares, route involvement, and other context. The publisher explicitly tests its association with future PPR scoring. [34] | Forecast-oriented indicator; public reports/paid tools. |
| **Rush share / opportunity share / snap share** | Measures the fraction of team or backfield workload handled by a player. Carries, targets, and snaps have different meanings; use the provider's denominator. [35] | Indicators; free/basic data or paid breakdowns. |
| **Goal-line, red-zone, two-minute, and passing-down usage** | Splits showing where a player receives opportunities. They help distinguish roles that can look identical in total touches. These are usage inputs rather than separate universal prediction models. [35] | Indicators; usually charting-dependent. |
| **Rushing Yards Over Expected — RYOE / RYOE per attempt** | Actual rushing yards minus the tracking model's expected yards. The per-attempt version normalizes volume. The baseline accounts for the positions and motion of surrounding players. [36] | Indicator/evaluation derived from a play model; public NGS outputs, restricted inputs. |
| **Rush percentage over expected — ROE%** | Share of qualifying carries gaining more yards than their modeled expectation. Differs from mean RYOE: frequency of beating expectation is not the same as size of the gain. [37], [73] | Indicator; NGS public outputs. |
| **Yards after contact per attempt — YAC/att** | Rushing yardage gained after first contact, normalized by carries. Measures post-contact production; it is different from receiving yards after catch, which shares the abbreviation YAC. [38], [69] | Indicator; PFF/SIS/other charting, usually paid. |
| **Missed tackles forced per attempt / touch** | Frequency with which the ball carrier makes a tackler miss. Per-carry and per-touch denominators differ, particularly for receiving backs. [69] | Indicator; charted data, usually paid. |
| **PFF Elusive Rating** | Composite of missed tackles forced and yards after contact intended to describe how difficult a runner is to bring down. [69] | Indicator/evaluation; paid. |
| **Yards Created** | Graham Barfield's charting approach evaluates yardage generated beyond the blocking available to the runner. It is distinct from both yards after contact and tracking-based RYOE. [39] | Indicator; published methodology and subscription analyses; implementation-specific. |
| **Breakaway percentage / explosive-run rate** | Describes long-run production. PFF's breakaway percentage is the share of rushing yards from runs of at least 15 yards; an explosive-run *rate* instead divides qualifying runs by attempts. [69] | Indicator/context; free/paid. |

For full PPR, use a PPR-specific xFP model or projection. An xFP value calculated under standard scoring is not directly comparable to a PPR value.

## 6. Offensive line, pass rush, and defense

| Metric / family | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **ESPN Pass Block Win Rate — PBWR** | Tracks protection lasting 2.5 seconds in its original formulation. [40] | Indicator; public leaders. |
| **ESPN Pass Rush Win Rate — PRWR** | Tracks how often rushers defeat blocks within the evaluation window. [43] | Indicator; public leaders, proprietary model. |
| **ESPN Run Block Win Rate — RBWR** | Tracking-based rate of successful run blocks under ESPN's criteria. [41] | Indicator; public leaders. |
| **ESPN Run Stop Win Rate — RSWR** | Tracks successful disruption and containment on running plays. [72] | Indicator; public leaders. |
| **Pass-Blocking Efficiency — PBE** | PFF's pressure-allowed rate summary, with additional weighting for sacks. Different from ESPN's block-win classification. [19] | Indicator/evaluation; paid. |
| **Pressure rate** | Pressures divided by pass-rush opportunities for a defender, or pressured dropbacks divided by total dropbacks for a team. Team pressure rate is not the sum of individual rates. [70] | Indicator; provider-dependent charting/tracking. |
| **Pass-Rush Productivity — PRP** | PFF composite combining sacks, hits, and hurries relative to pass-rush opportunities. Weights pressure outcomes instead of treating all pressures identically. [70] | Indicator/evaluation; paid. |
| **PFF pass-rush win percentage** | Share of rushes where the defender beats the blocker, including wins that do not become pressure before the throw. A separate charted measure from ESPN PRWR. [70] | Indicator; paid. |
| **Adjusted Line Yards — ALY** | FTN's run-blocking-oriented yardage measure assigns different credit by run length and applies contextual adjustments. It does not fully isolate offensive linemen from runners or scheme. [42] | Indicator/evaluation; FTN free/paid. |
| **Adjusted Sack Rate — ASR** | Sack and intentional-grounding frequency adjusted for situation and opponent. Can describe protection or defensive sack generation. [42] | Indicator; FTN free/paid. |
| **Run-stop percentage** | PFF's qualifying defensive stops divided by run-defense snaps. A stop reflects offensive failure under its down-and-distance rules. [70] | Indicator/evaluation; paid. |
| **Coverage EPA / target EPA allowed** | EPA on plays attributed to a defender, coverage, or defense. Attribution differs by charting provider; targeted-play statistics omit coverage on plays thrown elsewhere. [23], [26] | Evaluation/indicator; free team data, often paid individual data. |
| **Coverage grades / coverage Total Points** | PFF and SIS use their respective evaluation frameworks to assess coverage contribution. These are different systems, not alternative labels for one shared coverage metric. [17], [26] | Evaluation/indicator; paid. |

ESPN published a pass-block/pass-rush formula update in 2026. Historical definitions should not be assumed to describe every current implementation; check the methodology attached to the table being used. [43]

## 7. Models for individual plays, game states, and special teams

These genuinely predict outcomes, but generally on a seconds-to-minutes horizon. They should not be confused with season-long player-development forecasts.

| Metric / family | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **Completion probability — CP** | Probability of a pass being completed, conditional on throw characteristics. Public play-by-play and NFL tracking implementations differ. CPOE is the actual completion outcome minus this expectation. [14] | Play model; open and restricted variants. |
| **Expected rushing yards — xRY** | Expected rushing gain based on the situation and tracking geometry used by the model. RYOE compares the realized run with this baseline. [36] | Play model; NGS outputs, restricted full tracking. |
| **Expected Yards After Catch — xYAC** | Expected post-catch yardage, conditional on the catch situation. Public nflfastR approximations and NGS tracking models use different information. [14], [15] | Play model; open/restricted variants. |
| **Yards After Catch Over Expected — YACOE** | Actual receiving YAC minus the model's expected YAC. Evaluates what happened after the catch rather than the probability of making the catch. [15] | Indicator/evaluation; free/paid implementations. |
| **Expected pass probability — xPass** | Probability that a team calls a pass in a given game situation. An estimate of play selection, not passing success. [15] | Play model; open. |
| **Pass Rate Over Expected — PROE / pass_oe** | Actual pass frequency minus xPass expectation. Describes passing tendency after accounting for modeled game context. [15] | Indicator derived from a play model; open. |
| **Win Probability — WP** | Probability of winning from a game state. Some models incorporate pregame strength or the betting spread; others do not. [14] | Game-state forecast; free/open and proprietary variants. |
| **Win Probability Added — WPA** | Difference in WP before and after an event. Measures realized leverage-sensitive impact, not an independent projection of future ability. [14] | Evaluation; free/open. |
| **Fourth-down conversion probability and decision value** | Estimates conversion and resulting win probabilities for going, punting, or kicking. nfl4th's `go_boost` compares going for it with the next-best alternative. [44] | Play/decision model; open; proprietary alternatives also exist. |
| **Field-goal probability — xFG / FG probability** | Probability of making a particular kick. Model inputs vary: nfl4th explicitly documents limits concerning kicker identity and outdoor weather. [44] | Play model; open and proprietary variants. |
| **Field Goals Over Expected — FGOE / FG%OE** | Actual made kicks minus summed make probabilities, or actual percentage minus expected percentage. These count and percentage forms use different units. [45] | Indicator/evaluation; research/open and NGS versions. |
| **Expected field-goal opportunities / expected makes** | Models how often a team should attempt kicks from its fourth-down situations, then applies make probabilities. Separates opportunity from conversion skill. [46] | Forecast/play-model family; published research. |
| **Expected punt/kickoff return yards** | Predicts return-yard distributions using tracking information. Return yards over expected compares the outcome with that baseline; touchdown probabilities can also be derived. [47] | Play model; published NGS/AWS examples, restricted inputs. |
| **Pressure probability** | Estimates the probability of a defender generating quarterback pressure as the play unfolds. [48] | Play model; NGS/AWS outputs, restricted full data. |
| **Tackle probability** | Estimates a defender's chance of making a tackle from player location and movement. It enables opportunity-adjusted tackle evaluation. [49] | Play model; NGS/AWS, restricted full data. |
| **Tackles over expected / tackle yards saved** | Derivatives comparing tackles or prevented yardage with modeled opportunities. Distinguish making more tackles than expected from preventing more yards than expected. [50] | Evaluation/indicator; NGS/AWS published outputs. |
| **Defensive Alerts / predicted rushers** | Uses presnap alignment and movement to predict which defenders will rush. A tactical broadcast prediction, not a season ranking of pass-rush talent. [36] | Play model; broadcast-facing/restricted. |
| **Predicted passing yards / pass-outcome distributions** | Models the range of possible yardage outcomes for a pass using tracking sequences and game information. Such distributions can underpin performance evaluation rather than simply outputting a mean. [21] | Play model; proprietary tracking; methodological research public. |
| **Interception probability / EPA over expected — EPAOE** | Respectively models interception likelihood and compares realized passing value with modeled expectations. [51] | Model/evaluation; restricted. |

## 8. Draft prospects and early-career forecasts

| Metric / system | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **QBASE / QBASE 2.0** | Projects quarterback outcomes using college passing, teammate/opponent context, experience, development history, and—in 2.0—rushing ability. Published outputs include distributions of Total Defense-adjusted Yards Above Replacement per Attempt, not just a single ordinal ranking. [52] | Career forecast; FTN/ESPN, public methodology and paid detail. |
| **BackCAST** | Projects early NFL rushing production from a running-back prospect's statistical and athletic profile. [53] | Career forecast; paid detail. |
| **Playmaker Score** | Projects early-career NFL receiving production from a wide receiver's college profile. Versions can report expected yards per season and historical comparisons. [54] | Career forecast; published draft analyses, usually paid detail. |
| **SackSEER** | Nathan Forster's edge-rusher projection system targets sacks over the first five NFL seasons, using prospect information and athletic testing. [55] | Career forecast; annual ESPN analyses, usually paid detail. |
| **Travis tight-end projections** | Aaron Schatz's tight-end prospect projection system. FTN published a 2026 application; the accessible preview did not expose enough methodology to specify its complete formula or validation. [56] | Prospect forecast; paid detail. |
| **NGS Draft Model / Overall Draft Score** | NFL prospect-success model combining athleticism, size, and college production; component scores and an overall score summarize the assessment. [57] | Career forecast; public prospect outputs, proprietary model. |
| **Fantasy Life Rookie Super Model** | Composite prospect assessment incorporating draft capital, production, and film. It reports position-specific scores and profiles for fantasy-oriented prospect evaluation. [58] | Forecast-oriented prospect score; public profiles/other access varies. |
| **Relative Athletic Score — RAS** | Position-relative composite of athletic testing on a 0–10 scale. Describes athletic profile; a 9.0 RAS is not a 90% probability of NFL success. [59] | Indicator, not a standalone career forecast; free. |
| **Speed Score** | Weight-adjusted 40-yard-dash metric, particularly associated with running backs. Formula: `200 × weight in pounds / (40-yard time in seconds)^4`. Measures size-adjusted speed rather than complete football ability. [60] | Indicator; free/open. |
| **College Dominator Rating** | A production-share measure; for receivers it typically combines shares of team receiving yards and touchdowns. Definitions can differ by position and provider. [28] | Indicator; free/paid. |
| **Breakout age** | Age when a prospect first reaches a specified production-share threshold. The threshold is part of the definition; it is not a universal forecast equation. [28] | Indicator; free/paid. |
| **Age-adjusted college production / receiving yards per team pass attempt — RYPTPA** | Normalizes college receiving production for team passing volume; prospect models may further adjust for age and development. Fantasy Life publishes versions within its prospect framework. [58] | Indicator; provider-dependent. |

## 9. Research models and additional forecasting outputs

| Metric / model | Explanation and prediction target | Type; access |
| --- | --- | --- |
| **STRAIN** | Tracking-based pass-rush measure using distance to the quarterback and the rate that distance closes. Its authors report pressure predictability and temporal stability, and use multilevel modeling to estimate rusher contributions. [61] | Research indicator; paper public, tracking access limits reproduction. |
| **Expected Hypothetical Completion Probability — EHCP** | Research framework evaluates potential passing opportunities using tracking data, including hypothetical throws rather than only the throw selected. [62] | Research/play model; public paper, dataset-dependent. |
| **Defender Ghosting** | NFL/AWS model predicts plausible defender trajectories from tracking history and hypothetical receiving situations. Supports counterfactual play analysis; not a standard public player leaderboard. [63] | Research/play model; published methodology, restricted full data. |
| **SIS multi-year injury-risk model** | Forecasts missed time over one-, two-, and three-year horizons. Uses player, injury-history, workload, and performance information. Its training target blends actual missed games with prognosis-based expected absence. [64] | Availability forecast; published research, restricted detailed product data. |
| **Weekly / rest-of-season / season fantasy projections** | Explicit forecasts of volume, yardage, touchdowns, and fantasy points. FTN and Fantasy Life provide such products; other vendors have their own implementations. They are projection systems, not one standardized NFL metric. [35], [65] | Forecast; free/paid by provider. |
| **Projected ceiling, floor, boom/bust probability** | Describes a forecast distribution rather than just its average. Definitions vary: FantasyLabs documents a ceiling threshold exceeded with 15% probability. A provider's “ceiling” is not the player's maximum possible score. [66] | Forecast; usually paid. |
| **Similarity-based projections / historical-comparison models** | Forecast from the outcomes of comparable players. The choice of comparison features, sample, and horizon defines the model; a list of similar names alone is not a validated projection. [54], [66] | Forecast family; provider-dependent. |
| **Play-call prediction models** | Predict run/pass or other play choices from sequence and game context. For example, a hidden-Markov-model study reports out-of-sample 2018 play-call accuracy. Different from predicting whether the play succeeds. [67] | Research/forecast; public paper. |

There are additional vendor-specific power ratings, player projections, injury scores, and research submissions. A product described only as “AI-powered” without a documented target or method is not treated here as a separate validated metric.

## 10. Common inputs that should not be mistaken for prediction systems

The following are legitimate inputs or descriptive comparisons, but none is inherently a complete forecast:

| Input / statistic | What it tells you |
| --- | --- |
| **Prior fantasy points per game** | Previous scoring under the specified rules; frequently used as a forecasting baseline. [22] |
| **Designed QB rushes, scrambles, rushing yards, goal-line carries** | Different components of quarterback rushing involvement; fantasy analyses explicitly examine rushing volume and production. [22] |
| **Pace and play volume** | Number or rate of offensive opportunities. Plays per game and seconds per play are different measurements. [35] |
| **Strength of schedule — SOS** | Opponent quality under a chosen rating. Observed past schedule and projected future schedule differ. [9] |
| **Yards per carry, yards per target, TD rate, INT rate** | Observed outcome rates; not substitutes for role, context, sample size, or a fitted forecasting model. [8], [10] |
| **Passer rating** | Box-score passing composite, distinct from ESPN QBR, QB Elo, and NGS Passing Score. [8], [10] |
| **Catch rate, contested-catch rate, drop rate** | Different catch outcomes and denominators. High performance in one does not mechanically imply high performance in the others. [19] |
| **ADP / consensus rankings** | Market or expert ordering of players. Rank alone does not specify expected points, uncertainty, or probability of success. |
| **Approximate Value — AV** | Pro Football Reference's historical player-value summary; it is not a built-in career-growth forecast. [8] |

## 11. What the cited research actually establishes

This section reports published findings and stated objectives. It does not rank the metrics using an invented common accuracy score.

| Source / study | Reported result or stated objective | Boundary of that evidence |
| --- | --- | --- |
| **Fantasy Life Utilization Score** | Reports next-period PPR R² of **0.37 / 0.29 / 0.34** for RB/WR/TE week-over-week; **0.57 / 0.54 / 0.61** for rolling four-week periods. [34] | Publisher's reported tests; these are not percentages of individual forecasts that were “correct.” |
| **PFF WAR research** | Authors report greater player-level stability than the traditional and advanced measures they compared. [24] | Stability of a value estimate does not establish a universal advantage at predicting every future outcome. |
| **PFF YPRR analysis** | Reports that volume-based receiving metrics were generally more stable and more predictive of next-season fantasy points than efficiency metrics in that analysis. [27] | Does not establish one universal metric ranking across positions, samples, or horizons. |
| **STRAIN paper** | Authors report useful pressure prediction and temporal stability from tracking-based pass-rush measurement. [61] | Evidence concerns the paper's pressure-evaluation setting, not a demonstrated multi-year sack forecast. |
| **SIS injury model** | Reports one-year RMSE of **3.6 games** for offensive skill players and **3.7** for offensive linemen and defensive players. [64] | The modeled target blends actual absence and prognosis-based expected absence; individual outcomes remain uncertain. |
| **NGS Passing Score / Amazon Science** | Reports associations with winning and playoff outcomes, alongside its tracking-based modeling method. [21] | Same-season outcome correlation is not a test of next-season quarterback progression. |
| **Hidden-Markov play-call study** | Reports **71.5%** out-of-sample accuracy for predicting play calls in the 2018 season. [67] | Predicts play selection in that sample, not game winners or player quality. |

For metrics without a verified future-outcome test in the cited material, this document provides their definition and intended use without asserting a measured predictive advantage.

## 12. Finding the right category for a question

| Question | Relevant catalogue entries |
| --- | --- |
| Who is likely to win the next game? | FPI, nfelo, Massey–Peabody, Massey, projected DVOA; then game-specific probabilities. |
| How strong is a team after accounting for its opponents? | DVOA, SRS, WEPA, opponent-adjusted forecasts. |
| How will an established quarterback perform going forward? | QB Elo, Bayesian QB ratings, DAKOTA where available; compare their target with the performance being forecast. |
| How might a college prospect develop in the NFL? | QBASE, BackCAST, Playmaker, SackSEER, Travis, NGS Draft Model, Rookie Super Model. |
| Who may score more fantasy points next week or over the remaining season? | Explicit projections, Utilization Score, xFP, usage, and position-specific inputs. |
| How much value did a player provide this season? | PFF WAR, nflWAR, SIS Total Points, DYAR; these require another modeling step to become forecasts. |
| How difficult was a particular completion, run, tackle, or kick? | CP, xRY, xYAC, tackle probability, field-goal probability, and their over-expected derivatives. |

## Sources

Sources are primarily model creators, official documentation, provider research, and research papers. Older methodology pages explain the named versions; they should not be assumed to document every subsequent product change.

1. [ESPN — NFL Football Power Index][1]
2. [Aaron Schatz — 2026 DVOA projections][2]
3. [FTN — DVOA explainer][3]
4. [nfelo — model and repositories][4]
5. [Robby Greer — WEPA implementation][5]
6. [Wharton — Cade Massey on NFL ratings][6]
7. [Kenneth Massey — NFL ratings and predictions][7]
8. [Pro Football Reference — statistical glossary][8]
9. [FTN — DVOA, weighted DVOA, and schedule definitions][9]
10. [nfelo — QB Elo and quarterback metrics][10]
11. [nflfastR — current stats variables and DAKOTA availability][11]
12. [Kevin Cole — Bayesian quarterback rankings and AQE integration][12]
13. [Kevin Cole — Adjusted Quarterback Efficiency 2.0][13]
14. [Baldwin and Carl — nflfastR EP, WP, CP, xYAC, and xPass models][14]
15. [nflfastR — model outputs and worked examples][15]
16. [ESPN — how Total QBR is calculated][16]
17. [PFF — grading methodology][17]
18. [PFF — quarterback grades, big-time throws, turnover-worthy plays][18]
19. [PFF — signature statistics glossary][19]
20. [SIS — college/NFL on-target percentage and IQR][20]
21. [Amazon Science — NGS passing-score research][21]
22. [Fantasy Points — 2026 QB predictive-stat research summary][22]
23. [SumerSports — NFL advanced stats][23]
24. [PFF WAR — Sloan research paper][24]
25. [Yurko, Ventura, Horowitz — nflWAR][25]
26. [SIS — Total Points methodology update][26]
27. [PFF — YPRR and predictive receiving analysis][27]
28. [PlayerProfiler — metric definitions][28]
29. [nflreadr package documentation — player statistics and WOPR][29]
30. [ESPN — receiver tracking metrics methodology][30]
31. [Fantasy Points — Average Separation Score][31]
32. [Matt Harmon — Reception Perception methodology][32]
33. [Fantasy Points — first downs per route run][33]
34. [Fantasy Life — Utilization Score definitions and validation][34]
35. [Fantasy Life — utilization and projection resources][35]
36. [Amazon Science — NGS, expected rushing yards, defensive alerts][36]
37. [NFL Next Gen Stats — rushing metrics][37]
38. [PFF — 2017 rushing report][38]
39. [Graham Barfield — original Yards Created methodology][39]
40. [ESPN — original pass-block/pass-rush win-rate methodology][40]
41. [ESPN — run-block and run-stop win-rate definitions and leaders][41]
42. [FTN — analytics glossary, ALY and ASR][42]
43. [ESPN — 2026 formula update][43]
44. [nfl4th — fourth-down models and limitations][44]
45. [Ben Keener — Field Goals Over Expected][45]
46. [Yale Undergraduate Sports Analytics Group — kicker evaluation][46]
47. [AWS — expected punt and kickoff returns][47]
48. [AWS — NFL pressure probability][48]
49. [AWS — tackle probability][49]
50. [AWS — tackle analysis and yards saved][50]
51. [NFL — interception probability and EPAOE][51]
52. [FTN — QBASE 2.0 methodology and 2026 projections][52]
53. [ESPN — BackCAST 2026][53]
54. [ESPN — Playmaker Score 2026][54]
55. [ESPN — SackSEER 2026][55]
56. [FTN — Travis tight-end projections][56]
57. [NFL Giants — NGS Draft Model explanation][57]
58. [Fantasy Life — Rookie Super Model and RYPTPA example][58]
59. [Relative Athletic Score — methodology][59]
60. [FTN — Speed Score methodology][60]
61. [Nguyen, Yurko, Matthews — STRAIN][61]
62. [Expected Hypothetical Completion Probability][62]
63. [AWS — Defender Ghosting][63]
64. [SIS — multi-year injury model][64]
65. [FTN — weekly projection/ranking products][65]
66. [FantasyLabs — floor, ceiling, and comparable-player definitions][66]
67. [Ötting — hidden-Markov NFL play-call prediction][67]
68. [nflfastR — changelog and historical DAKOTA definition][68]
69. [PFF — running-back signature statistics][69]
70. [PFF — defensive-line signature statistics][70]
71. [PFF — weighted opportunity and expected fantasy points][71]
72. [ESPN — run-block and run-stop methodology][72]
73. [nflreadr — Next Gen Stats data dictionary][73]

[1]: https://www.espn.com/nfl/fpi "ESPN — NFL Football Power Index"
[2]: https://ftnfantasy.com/aaron-schatzs-2026-dvoa-projections "Aaron Schatz — 2026 DVOA projections"
[3]: https://ftnfantasy.com/nfl/dvoa-explainer "FTN — DVOA explainer"
[4]: https://www.nfeloapp.com/about/ "nfelo — model and repositories"
[5]: https://github.com/greerreNFL/wepa "Robby Greer — WEPA implementation"
[6]: https://www.wharton.upenn.edu/story/prof-cade-massey-explains-the-analytics-behind-his-nfl-rankings/ "Wharton — Cade Massey on NFL ratings"
[7]: https://masseyratings.com/nfl "Kenneth Massey — NFL ratings and predictions"
[8]: https://www.pro-football-reference.com/about/glossary.htm "Pro Football Reference — statistical glossary"
[9]: https://ftnfantasy.com/stats/nfl/team-total-dvoa "FTN — DVOA, weighted DVOA, and schedule definitions"
[10]: https://www.nfeloapp.com/qb-rankings/ "nfelo — QB Elo and quarterback metrics"
[11]: https://nflfastr.com/articles/stats_variables.html "nflfastR — current stats variables and DAKOTA availability"
[12]: https://www.unexpectedpoints.com/p/week-1-bayesian-quarterback-rankings-dd8 "Kevin Cole — Bayesian quarterback rankings and AQE integration"
[13]: https://www.unexpectedpoints.com/p/adjusted-quarterback-efficiency-20 "Kevin Cole — Adjusted Quarterback Efficiency 2.0"
[14]: https://opensourcefootball.com/posts/2020-09-28-nflfastr-ep-wp-and-cp-models/ "Baldwin and Carl — nflfastR EP, WP, CP, xYAC, and xPass models"
[15]: https://nflfastr.com/articles/nflfastR.html "nflfastR — model outputs and worked examples"
[16]: https://www.espn.com/blog/statsinfo/post/_/id/123701/how-is-total-qbr-calculated-we-explain-our-quarterback-rating "ESPN — how Total QBR is calculated"
[17]: https://www.pff.com/grades "PFF — grading methodology"
[18]: https://www.pff.com/news/pro-how-pff-grades-quarterback-play "PFF — quarterback grades, big-time throws, turnover-worthy plays"
[19]: https://www.pff.com/news/pro-pff-signature-statistics-a-glossary "PFF — signature statistics glossary"
[20]: https://www.sportsinfosolutions.com/2025/04/08/study-comparing-college-and-nfl-on-target-percentage/ "SIS — college/NFL on-target percentage and IQR"
[21]: https://www.amazon.science/blog/the-science-behind-nfl-next-gen-stats-new-passing-metric "Amazon Science — NGS passing-score research"
[22]: https://newsletter.fantasypoints.com/p/qb-stats-that-matter-roundup "Fantasy Points — 2026 QB predictive-stat research summary"
[23]: https://sumersports.com/the-zone/nfl-advanced-stats/ "SumerSports — NFL advanced stats"
[24]: https://www.sloansportsconference.com/research-papers/pff-war-modeling-player-value-in-american-football "PFF WAR — Sloan research paper"
[25]: https://arxiv.org/abs/1802.00998 "Yurko, Ventura, Horowitz — nflWAR"
[26]: https://www.sportsinfosolutions.com/2024/08/19/total-points-stat-updates-football-analytics/ "SIS — Total Points methodology update"
[27]: https://www.pff.com/news/fantasy-football-metrics-that-matter-yards-per-route-run "PFF — YPRR and predictive receiving analysis"
[28]: https://www.playerprofiler.com/terms-glossary/ "PlayerProfiler — metric definitions"
[29]: https://mirrors.nics.utk.edu/cran/web/packages/nflreadr/vignettes/dictionary_player_stats.html "nflreadr package documentation — player statistics and WOPR"
[30]: https://www.espn.com.au/nfl/story/_/id/34649390/espn-receiver-tracking-metrics-how-new-nfl-stats-work-open-catch-yac-scores "ESPN — receiver tracking metrics methodology"
[31]: https://www.fantasypoints.com/nfl/articles/2024/what-is-ass-average-separation-score "Fantasy Points — Average Separation Score"
[32]: https://receptionperception.com/introduction-to-reception-perception-and-its-new-home/ "Matt Harmon — Reception Perception methodology"
[33]: https://www.fantasypoints.com/nfl/articles/2025/statistically-significant-first-downs-per-rr "Fantasy Points — first downs per route run"
[34]: https://www.fantasylife.com/articles/fantasy/the-utilization-score-understanding-player-roles-and-performance "Fantasy Life — Utilization Score definitions and validation"
[35]: https://www.fantasylife.com/nfl/utilization-report/season-stats "Fantasy Life — utilization and projection resources"
[36]: https://www.amazon.science/blog/a-decade-of-nfl-next-gen-stats-innovation "Amazon Science — NGS, expected rushing yards, defensive alerts"
[37]: https://nextgenstats.nfl.com/stats/rushing "NFL Next Gen Stats — rushing metrics"
[38]: https://media.pff.com/2018/02/17rushing.pdf "PFF — 2017 rushing report"
[39]: https://fantasygametheory.wordpress.com/2016/04/18/introduction-to-yards-created-c-j-prosise/ "Graham Barfield — original Yards Created methodology"
[40]: https://www.espn.com/nfl/story/_/id/24892208/creating-better-nfl-pass-blocking-pass-rushing-stats-analytics-explainer-faq-how-work "ESPN — original pass-block/pass-rush win-rate methodology"
[41]: https://www.espn.com/nfl/story/_/id/49742016/2026-win-rates-team-player-rankings-pass-rush-run-stop-blocking "ESPN — run-block and run-stop win-rate definitions and leaders"
[42]: https://ftnfantasy.com/nfl/guide-to-football-analytics "FTN — analytics glossary, ALY and ASR"
[43]: https://www.espn.com.au/nfl/story/_/id/49672562/nfl-new-pass-block-push-rush-win-rates-formula-takeaways-analytics "ESPN — 2026 formula update"
[44]: https://www.nfl4th.com/ "nfl4th — fourth-down models and limitations"
[45]: https://github.com/benKeener/Field-Goals-over-expected "Ben Keener — Field Goals Over Expected"
[46]: https://sports.sites.yale.edu/nfl-kicker-evaluation "Yale Undergraduate Sports Analytics Group — kicker evaluation"
[47]: https://aws.amazon.com/blogs/industries/nfl-next-gen-stats-expected-punt-and-kickoff-return-yards-qa-with-the-amazon-machine-learning-solutions-lab/ "AWS — expected punt and kickoff returns"
[48]: https://aws.amazon.com/video/watch/f51427e8c9d/ "AWS — NFL pressure probability"
[49]: https://aws.amazon.com/blogs/media/a-new-take-on-tackling-nfl-next-gen-stats-and-aws-bring-data-to-the-gridiron/ "AWS — tackle probability"
[50]: https://aws.amazon.com/blogs/media/beyond-the-box-score-aws-and-nfl-ai-powered-tackle-analysis/ "AWS — tackle analysis and yards saved"
[51]: https://www.nfl.com/news/next-gen-stats-intro-to-passing-score-metric "NFL — interception probability and EPAOE"
[52]: https://ftnfantasy.com/nfl/fernando-mendoza-far-ahead-of-other-prospects-in-qbase-projections-for-2026 "FTN — QBASE 2.0 methodology and 2026 projections"
[53]: https://www.espn.com/nfl/draft2026/story/_/id/48357267/2026-nfl-draft-running-back-projections-rankings-historical-comps-prospects "ESPN — BackCAST 2026"
[54]: https://www.espn.ph/nfl/story/_/id/48304971/2026-nfl-draft-wide-receiver-projections-stats-historical-comps-prospects "ESPN — Playmaker Score 2026"
[55]: https://www.espn.co.uk/nfl/draft2026/story/_/id/48359548/utils "ESPN — SackSEER 2026"
[56]: https://ftnfantasy.com/nfl/kenyon-sadiq-sets-travis-projection-record "FTN — Travis tight-end projections"
[57]: https://www.giants.com/news/next-gen-stats-nfl-draft-combine-top-prospects-harvard-student "NFL Giants — NGS Draft Model explanation"
[58]: https://www.fantasylife.com/articles/fantasy/deion-burks-rookie-super-model-prospect-profile-for-the-2026-nfl "Fantasy Life — Rookie Super Model and RYPTPA example"
[59]: https://www.ras.football/about "Relative Athletic Score — methodology"
[60]: https://ftnfantasy.com/nfl/speed-scores-2026-mike-washington-nears-the-record "FTN — Speed Score methodology"
[61]: https://arxiv.org/abs/2305.10262 "Nguyen, Yurko, Matthews — STRAIN"
[62]: https://arxiv.org/abs/1910.12337 "Expected Hypothetical Completion Probability"
[63]: https://aws.amazon.com/blogs/machine-learning/predicting-defender-trajectories-in-nfls-next-gen-stats/ "AWS — Defender Ghosting"
[64]: https://www.sportsinfosolutions.com/2025/09/10/introducing-our-multi-year-injury-risk-model/ "SIS — multi-year injury model"
[65]: https://ftnfantasy.com/jeff-ratcliffes-week-5-2026-nfl-fantasy-football-rankings "FTN — weekly projection/ranking products"
[66]: https://support.fantasylabs.com/hc/en-us/articles/214870428-Glossary-of-Terms-NFL "FantasyLabs — floor, ceiling, and comparable-player definitions"
[67]: https://arxiv.org/abs/2003.10791 "Ötting — hidden-Markov NFL play-call prediction"
[68]: https://nflfastr.com/news/index.html "nflfastR — changelog and historical DAKOTA definition"
[69]: https://www.pff.com/news/pro-signature-stat-spotlight-running-backs "PFF — running-back signature statistics"
[70]: https://www.pff.com/news/pro-signature-stats-spotlight-defensive-line "PFF — defensive-line signature statistics"
[71]: https://www.pff.com/news/fantasy-football-weighted-opportunity-a-better-fantasy-football-predictor-than-raw-touches "PFF — weighted opportunity and expected fantasy points"
[72]: https://www.espn.com/nfl/story/_/id/29813062/introducing-new-nfl-run-blocking-run-stopping-stats-how-run-block-win-rate-run-stop-win-rate-work "ESPN — run-block and run-stop methodology"
[73]: https://nflreadr.nflverse.com/articles/dictionary_nextgen_stats.html "nflreadr — Next Gen Stats data dictionary"
