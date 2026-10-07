# Injury -> post-return performance: literature survey (skill positions)

Scope: QB/RB/WR/TE in the NFL. Question: once a player returns from injury, how far
below his own pre-injury baseline does he produce (a) in the first 1-4 games back and
(b) in the next season, and how likely is he to get hurt again?
Survey date: 2026-10-05. Abstracts were read verbatim via Europe PMC. Full text was read where
it was open access. "Blog" = fantasy-industry analysis, not peer-reviewed.

Conventions:

- PPG = fantasy points per game. PR = "power rating" = yards/10 + 6 x TD (Carey 2006 formula).
- AV = Pro-Football-Reference Approximate Value. DiD = difference-in-differences against matched controls.
- "1W" = first game after the injury, including players who missed no games. "1WM" = first game back
  after missing at least 1 week. "3W" = average of the first 3 games back. These come from the 4for4 Injury Index (blog).
- Unless stated otherwise, % changes are against the player's own pre-injury baseline.

---

## 1. Summary table

| Injury                                   | Typical time missed                                                                       | Return rate (RTP)                                               | First 1-4 games back                                                                                                                                         | Next season                                                                                                                                                                           | Re-injury                                                                                                   | Evidence                                                                                            | Key sources                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **ACL tear**                             | 10.8-13.6 mo (season-ending)                                                              | 56-79% overall; RB/WR 62-79%; QB 92%                            | n/a (returns the next season)                                                                                                                                | RB: per-game PR -34% (Carey); RB PPG 8.5->4.4 (-48%) vs controls -16%; WR PPG -28% vs controls -6% (Burgess). QB: no effect. Only 19% of returners regain pre-injury level (preprint) | Revision/second-ACL data exist; utilization not predictive                                                  | **Strong** that RB/WR decline; magnitude moderate (-20 to -50%)                                     | Carey 2006; Burgess 2022; Manoharan 2021; Mody 2022; Erickson 2014; Cohn 2025 (preprint) |
| **Achilles rupture**                     | ~11 mo (340 d)                                                                            | 57-81% (pooled 66%); WR as low as 38%                           | n/a                                                                                                                                                          | AV -20.7% beyond aging (DiD), largest in season 1; only 27% regain baseline. Old skill-position PR declines -78% to -88% over 3 yrs (small n, no control)                             | --                                                                                                          | **Moderate** (one good DiD; skill-position n small)                                                 | Prempeh 2026; Jack 2017; Barton 2023; Parekh 2009; Butler 2024 SR                        |
| **Patellar/quad tendon rupture**         | median 11.3 mo                                                                            | 50-57%                                                          | n/a                                                                                                                                                          | AV declines persisting into season 2                                                                                                                                                  | --                                                                                                          | **Moderate** (worst career effect in NO-SOD)                                                        | Mai 2016 (NO-SOD); Choudhry 2025                                                         |
| **Hamstring strain**                     | ~2.4 wk on report; 1.8-3.0 games missed                                                   | ~100% (same season)                                             | Snap % -34% G1, -24% G2, -20% G3 (media, unverified). Fantasy: RB -23 to -25%, WR -18 to -19%, TE -38% in G1; **~0% by the 3-game avg** (RB -4.5%, WR +0.7%) | No skill-position study                                                                                                                                                               | **33-38% any recurrence; 12% same season; highest if RTP within 2 wk (13.4%)**; WR highest same-season risk | Re-injury **strong**; short-term **weak-moderate**; next season **none**                            | Jenkins 2024; Bodendorfer 2023; 4for4 2022 (blog); Provencher 2021 (media)               |
| **High-ankle sprain**                    | RB ~3.1 wk, WR ~5.2 wk (blog); mean 80 d incl. severe (study)                             | 89.7%                                                           | RB: -22% G1 and **-22% 3-game avg**; rest of season -14% to -21%; 11/13 RBs below baseline in G1; ~2.5 games to reach baseline                               | All ankle injuries: RB/WR/TE PPG 5.85->4.53 (-23%), matched controls flat                                                                                                             | WR 15%, RB 4% (blog)                                                                                        | Short-term **moderate-weak** (two blogs agree for RBs); next season **moderate** (ankle as a whole) | DeFroda 2022; Bergstein 2024; 4for4 2022; Betz 2022 (blog)                               |
| **Low (lateral) ankle sprain**           | ~1-2 games (unverified)                                                                   | ~100%                                                           | TE inversion sprain -31% G1, -12% 3-game (blog); "little efficiency dip" (Chona heuristic)                                                                   | Included in the -23% all-ankle figure; no type-specific difference found                                                                                                              | --                                                                                                          | **Weak**                                                                                            | 4for4 2022; Bergstein 2024; Desai 2022                                                   |
| **MCL sprain (isolated)**                | ~3.1-3.8 wk (blog)                                                                        | ~100%                                                           | RB -9% G1 / -18% 3-game; WR -26% / -24%; TE -54% / -17% (blog)                                                                                               | No NFL data                                                                                                                                                                           | WR 10% (blog)                                                                                               | **Weak** (no peer-reviewed NFL data)                                                                | 4for4 2022; Bakshi 2018 (ACL+MCL only)                                                   |
| **Meniscus (partial meniscectomy)**      | Lateral: 8.5 mo to prior level (surgical series)                                          | Lateral menisectomy 61%; speed players 4x less likely to return | No data                                                                                                                                                      | No skill-position data                                                                                                                                                                | --                                                                                                          | **Weak**                                                                                            | Aune 2014; Brophy 2009                                                                   |
| **Lisfranc**                             | median 11.0-11.1 mo; median 8.5 games                                                     | 82-93%                                                          | n/a                                                                                                                                                          | AV median 6.0->5.0 at 1 yr (P=.022); snaps and games unchanged                                                                                                                        | --                                                                                                          | **Weak-moderate** (n=28-33, few skill players)                                                      | McHale 2016; Abed 2023                                                                   |
| **Jones fracture (5th metatarsal)**      | 8.7 wk same-season (range 5.9-13.6)                                                       | ~100%                                                           | Early return (<=10 wk): performance -53% vs +9% for >10 wk (poster)                                                                                          | --                                                                                                                                                                                    | **Refracture 4-12%**                                                                                        | Return rate **moderate**; performance **weak**                                                      | Lareau 2016; Luo 2023 SR; Parekh 2017 poster                                             |
| **Turf toe**                             | Non-op 76 d; op 221 d; mild cases 37 d                                                    | 91% (non-op 100%, op 80%)                                       | --                                                                                                                                                           | No effect vs controls (two studies). Surgical: only 27% of skill players regain prior level, vs 78% non-op                                                                            | --                                                                                                          | **Moderate null** (non-op); **weak** (op)                                                           | Tran 2019; Madi 2023; Lindsey 2020 abstract                                              |
| **Calf strain**                          | ~2 games                                                                                  | 84% same season                                                 | Conflicting: RB -36% G1 / -41% 3-game, WR -33% / -14% (blog) vs "no significant change" (poster)                                                             | --                                                                                                                                                                                    | 20.7% later calf/Achilles injury; WR 18% (blog)                                                             | **Weak / conflicting**                                                                              | Zofkie & Gallo 2024 poster; 4for4 2022                                                   |
| **Groin / core muscle (sports hernia)**  | Strain ~2 games (blog); adductor rupture 6.1 wk non-op, 12 wk op                          | Surgery 90-96%                                                  | WR groin: -29% G1, -15% 3-game (blog); core "no noticeable dip" (Chona)                                                                                      | No performance change after surgery vs pre or controls; ~2 fewer games per season                                                                                                     | WR groin 17% (blog)                                                                                         | Long-term **moderate null**; short-term **weak**                                                    | Jack 2017; Lynch 2017; Mai 2016; Schlegel 2009; 4for4                                    |
| **Concussion**                           | 1.5 +/- 0.9 games (RB/WR)                                                                 | 89% same season                                                 | **No change** in PFF grade, DYAR or PR vs baseline or controls (3 studies). Blog shows RB -14% / WR -23% in G1 (unadjusted)                                  | No PR difference vs controls at +/-1 and +/-3 yrs                                                                                                                                     | No significant rise in later MSK injury (HR 1.12, CI 0.90-1.41)                                             | **Strong null**                                                                                     | Kumar 2014; Reams 2017; Jildeh 2019; Wasserman 2024                                      |
| **Shoulder: instability / labrum**       | Non-op 0 wk (subluxation), 3 wk (dislocation); surgery ~39 wk; labral repair median 265 d | 86-92%                                                          | --                                                                                                                                                           | Labral repair: usage no different from matched controls; offensive grades trend lower (P=.09)                                                                                         | **47% recurrent instability** (55% non-op vs 26% op)                                                        | Return/recurrence **moderate**; performance **weak**                                                | Okoroha 2018; Dillon 2026                                                                |
| **Shoulder: AC joint**                   | mean 9.8 d; QB 17.3 d                                                                     | ~100%                                                           | QB shoulder (all types): -16% G1, -6% 3-game (blog)                                                                                                          | --                                                                                                                                                                                    | RB 22%, WR 29% (blog)                                                                                       | **Weak**                                                                                            | Lynch 2013 (NFLISS); 4for4                                                               |
| **Back / lumbar disc**                   | Surgery: season-scale                                                                     | 61-78% after discectomy                                         | QB back: -39% G1 (blog, tiny n)                                                                                                                              | No per-game performance change after discectomy (two studies)                                                                                                                         | --                                                                                                          | **Moderate null** (surgical); in-season **weak**                                                    | Hsu 2010; Dupont 2023; O'Malley 2025                                                     |
| **Cervical (neck) surgery**              | season-scale                                                                              | 47%                                                             | --                                                                                                                                                           | Rating -5.8%                                                                                                                                                                          | --                                                                                                          | **Weak**                                                                                            | O'Malley 2025; Mai 2016                                                                  |
| **Clavicle fracture**                    | median 3.5 mo, 8 games                                                                    | 94-97%                                                          | --                                                                                                                                                           | No performance effect vs controls (non-op and overall). ORIF: QB (n=3) and RB (n=5) worse than controls                                                                               | --                                                                                                          | **Moderate null** (tiny subgroups)                                                                  | Vora 2019; Jack 2017 x2                                                                  |
| **Forearm / hand / metacarpal fracture** | Metacarpal median 15 d; forearm ORIF 152 d                                                | 92-100%                                                         | --                                                                                                                                                           | Forearm ORIF: no performance change                                                                                                                                                   | --                                                                                                          | **Moderate null**                                                                                   | Sharareh 2023; Sochacki 2018                                                             |
| **Ankle fracture (ORIF) / tibia**        | ~98 d on IR                                                                               | 71-80%                                                          | --                                                                                                                                                           | Ankle ORIF: no change in AV or snaps/game at 1-2 seasons (vs pre and controls). Tibia: decline in season 1, back to baseline later                                                    | --                                                                                                          | **Weak-moderate**                                                                                   | Robbins 2022; Mai 2016; Nudelman 2023                                                    |
| **Any time-loss injury (pooled)**        | --                                                                                        | --                                                              | Playing with a Questionable/Doubtful tag: -18.6% (QB -8%, RB -16%, WR -22%, TE -18%) (blog)                                                                  | Next-season PPG -0.50 overall (RB -0.70, WR -0.33, QB -1.95), **no control**; games missed does not predict the PPG change (R^2=0.005)                                                | --                                                                                                          | **Weak** (uncontrolled)                                                                             | Angileri 2025; 4for4                                                                     |

---

## 2. Per-injury notes

### 2.1 ACL tear (RB, WR, TE; QB separately)

- **Carey 2006** (AJSM; RB/WR, 1998-2002; 31 players / 33 ACLs; control = 146 RB/WR from 2000): >1/5 never returned (~79% RTP). First game back 55.8 +/- 5.4 wk after injury. For 24 players with a total PR >= 200, **PR per game fell from 9.9 to 6.5 (-34%)**, P=.002 against the control change. Survivorship: players who never returned are excluded.
- **Burgess 2022** (ASMAR; 1988-2017; 13 QB, 30 RB, 29 WR; matched controls; ESPN standard scoring). Full text:
  - **RB**: per-game pre 8.53 -> post 4.43 (P=.003). Controls 13.31 -> 11.18 (-16%; natural decline). Cases had lower PPG than controls before injury (8.53 vs 13.31, P=.001), so the headline "4.4 vs 11.2" overstates the effect. The within-player drop (-48%) minus the control drift (-16%) gives roughly **-32 percentage points**.
  - **WR**: pre 6.87 (cases) vs 8.17 (controls) (P=.34). After: 4.97 vs 7.71 (P=.042). That is roughly **-28% for cases vs -6% for controls**.
  - **QB**: no significant change against pre-injury or controls.
  - RBs declined the most in each of the 3 seasons after reconstruction.
- **Manoharan 2021** (OJSM; 2009-2016 RB/WR): RTP 61.8% (RB 64.5%, WR 60%) at 13.6 mo (RB 14.4 +/- 9.6 mo, WR 12.7 +/- 2.8 mo). Performance subset (RB n=15, WR n=21):
  - RB yards/carry 4.45 -> 3.42 (P=.004). Carries/game 8.43 -> 6.78 (not significant). RBs did not differ significantly from controls.
  - WR receptions/game 2.86 -> 1.95 (P=.001). Yards/reception 12.7 -> 9.9 (P=.014). Receiving TDs/season 3.71 -> 2.12 (P=.001).
- **Burgess 2021** (ASMAR; 29 WR, 2013-2017): RTP 69% at 331 d. Pre vs post **receptions per game unchanged (2.6 vs 2.6, P=.90)**. Career totals were much lower than controls (games 25.5 vs 56.6), so much of the "decline" is fewer games and seasons, not lower per-game output.
- **Mody 2022** (OJSM; 2013-2018; 312 players, all positions): RTP 55.8%; only 28.5% still in the league at 3 yrs. After return: games 13.7 -> 8.7, snaps 619 -> 259, "performance score" 4.3 -> 1.5. **QB RTP 92.9%, performance -2%. RB performance -90.5%.** These are season totals, so missed games are included.
- **Shah 2010** (AJSM; 49 players): RTP 63% at 10.8 mo. **Yang 2017**: RTP 61.7% (skill 64.1%).
- **Erickson 2014** (Orthopedics; QBs): 12/13 knees (92%) returned; no significant performance decline.
- **Mai 2016 NO-SOD** (AJSM; 559 players, 10 procedures): ACL reconstruction showed lower performance in season 1 and **sustained** decreases. Games played recovered to baseline by years 2-3.
- **Cohn 2025** (Research Square **preprint**, not peer-reviewed; 200 players, 2005-2021):
  - Fantasy score 95.6 -> 59.1 (-38%; P<.001).
  - Of 142 who returned, **19% regained >=100% of pre-injury production**; 79% of those did so within 2 seasons.
  - Younger players recovered fully more often (24% vs 12%).
- **Kajy 2023** (Cureus; 4 leagues; NFL n=25): fantasy score -33% to -42% across leagues.
- Blogs:
  - **Porras 2023** (Injury Prone newsletter; 36 RBs since 2010): 53% never played again. **Only 11% reached >=85% of pre-injury PPR PPG by year 2.** Only 4 RBs scored >=10 PPR PPG and >=85% of baseline in year 1 (Dobbins, Peterson, Sproles, Charles). WR failure-to-return 33% (2012-2020).
  - **Betz 2022** (Fantasy Footballers): year-1 efficiency (YPC, YCO/A) is below baseline for almost all RBs. No pooled numbers.
- In-app relevance: for a redraft season, an ACL means season-ending IR, then a return the next season. The usable signal is a **first-season-back multiplier** for players who tore an ACL in the prior season, roughly **RB 0.65-0.75, WR 0.75-0.85, QB ~1.0** (derived from Carey and Burgess; a judgement, not a published figure).

### 2.2 Achilles rupture

- **Prempeh 2026** (Phys Sportsmed; 62 players 2008-2022, matched 1:1 on position/age/size/tenure; AV; mixed-effects DiD with placebo tests):
  - RTP 80.6%.
  - **AV -20.7% beyond normal aging** (beta -1.24 AV, P=.043), **largest in the first season back**.
  - Only 27.1% of 48 returned to their pre-injury level.
  - Career-ending hazard HR 1.68.
  - This is the best-designed study in the survey.
- **Jack 2017** (FAI; 95 players / 98 repairs): RTP 72.4% at 339.8 +/- 84.8 d. 32% of repairs were in camp or preseason. Games/season not different from controls. **RB (n=4) postoperative scores worse than preoperative.**
- **Barton 2023** (Foot Ankle Spec; skill positions 2009-2016): RTP 57% (TE 71%, **WR 38%**). WRs who returned had fewer receptions/game than controls (P=.01). RBs "decreased in all categories".
- **Parekh 2009** (Foot Ankle Spec; 31 ruptures 1997-2002; no control): 32% never returned. PR over 3 yrs: **WR -88%, RB -83%, TE -78%**. These are totals, so missed games are included.
- **Butler 2024 systematic review** (Foot Ankle Orthop; 12 studies, 676 players): pooled RTP 66.2% at 10.9 +/- 1.3 mo. 2.2 +/- 0.8 seasons played after the injury. 50.4% of ruptures in preseason.
- **NO-SOD 2016**: lower performance in season 1, then **recovered to baseline**. This differs from ACL, where the decrease was sustained.

### 2.3 Hamstring strain

- **Jenkins 2024** (OJSM; 2008-2020 official injury reports; 2101 injuries / 1354 players):
  - Mean time on the report 2.4 +/- 2.1 wk.
  - **33% had a later hamstring re-injury; 27% of those came in the same season.** Re-injury duration was the same as the first injury (2.4 wk).
  - Offensive skill players accounted for 37.7% of injuries.
- **Bodendorfer 2023** (Phys Sportsmed; 2009-2020; 2075 hamstring injuries):
  - **38.4% recurrent; 11.9% same-season re-injury.**
  - Same-season risk factors: fewer weeks before return, injury during a game, lower BMI, **WR position**.
  - **Recurrence risk is highest when the player returns within 2 weeks (13.4%).**
- **Elliott 2011** (AJSM; NFL Injury Surveillance 1989-1998; 1716 strains): 51.3% occurred in the 7-week preseason; WRs had 20.8% of strains. Other numbers in the full text are not verified here.
- **Provencher 2021** (Fox Sports column by an orthopaedic surgeon; cites "a 2017 study I conducted"; methods not published, so **unverified**):
  - **Snap % -34% in game 1 back, -24% game 2, -20% game 3, -11.9% for the rest of the season after games 4-5.**
  - Same-season re-injury 15.5%; 24% chance of a different injury; 1.8 games missed on average.
- **4for4 Injury Index 2022** (blog; 2017-2021; about 1200 skill-position injuries; baseline = healthy-game average; no controls; n per cell not shown):

  | Position | 1W     | 1WM    | 3W    | Re-injury | Weeks missed |
  | -------- | ------ | ------ | ----- | --------- | ------------ |
  | RB       | -24.9% | -22.7% | -4.5% | 14.3%     | 3.0          |
  | WR       | -18.8% | -17.8% | +0.7% | 15.2%     | 2.6          |
  | TE       | -38.1% | -38.5% | +7.6% | 7.7%      | --           |
  | QB       | -36.2% | --     | -5.2% | 20%       | --           |

- **Chona** (SportsMedAnalytics, via FantasyPros 2023 columns; proprietary model, **heuristics, not published data**):
  - WR hamstring: "~100% pre-injury production" or a "mild ~10% hit", with 10-15% re-injury risk.
  - "10% explosiveness dip for Weeks 1-2, full by Week 3-4."
  - Older RBs get fewer touches in the first game back; young RBs do not.
- Next season: no NFL study isolates hamstring and skill-position production the following season.

### 2.4 High-ankle (syndesmotic) sprain

- **DeFroda 2022** (Phys Sportsmed; 2009-2020; 533 sprains / 498 players): RTP 89.7%. **Mean 80.5 +/- 132.9 d** (heavily skewed by severe and surgical cases). Offensive players 90.1 d vs defensive 68.1 d. Older age predicts failure to return. The paper did not study performance.
- **Kuhn 2025** (Sports Health; NFL MRI cohort, n=83 external-rotation syndesmosis injuries): only 13% were isolated syndesmosis injuries. An associated fracture or a complete deep-deltoid tear or diastasis lengthened time to full participation.
- **Ziedas 2025** (ASMAR; 14 NFL suture-button/TightRope cases): 100% RTP; NFL mean 189.6 d to first game (includes off-season gaps); later workload unchanged.
- **4for4 2022** (blog):
  - **RB: 3.1 wk missed; 1W/1WM -22.3%; 3W -21.7%; ROS -13.7% (0-8 wk missed) or -20.7% (>=1 wk missed); re-injury 4.3%.**
  - WR: 5.2 wk; -16.5% in G1, then **+11.4%** over the 3-game avg; re-injury 15%.
  - TE 4.8 wk and QB 4.4 wk missed; no performance numbers.
- **Betz 2022** (Fantasy Footballers, blog; 2019-2021; 35 players: 4 QB, 17 RB, 9 WR, 5 TE; surgical and season-ending cases excluded):
  - 3.34 games missed.
  - **69% below pre-injury fantasy level in game 1; average 2.52 games to reach baseline; 27% never reached it that season; 65% below baseline for the rest of the season.**
  - RBs: 11/13 below baseline in game 1; 4/13 never reached it.
- **Bergstein 2024** (J Orthop; 2009-2020; 303 skill players with ankle sprains, high-ankle sprains or bone bruises; controls matched on position/age/BMI):
  - **RB/WR/TE PPG 5.85 -> 4.53 next season (-23%, P<.0001)**; games 13.07 -> 10.07. **Controls were essentially flat** (only receiving yards changed slightly).
  - QB (n=17): 12.08 -> 9.93, not significant.
  - Injury type (high vs low ankle) and RTP time were **not** significant covariates.
- **Desai 2022** (OJSM; 2015-2017; 668 ankle injuries; **no control**): RTP 91%. PR/game -14% in Y+1, -17% in Y+2. Sprains -25% total PR. WR (n=38) PR -21.5 (P=.015).

### 2.5 Low (lateral/inversion) ankle sprain

- No skill-position NFL study isolates it. 4for4: TE inversion sprain -31.0% (1W), -36.9% (1WM), -11.9% (3W). Chona heuristic: "low ankle sprains typically do not cause much efficiency dip", with a mild workload dip. It is included in Bergstein's pooled -23% next-season figure; type made no significant difference there.

### 2.6 MCL sprain

- No peer-reviewed NFL study of isolated in-season MCL sprains and performance was found.
- 4for4 (blog): RB -8.9% (1W), -17.5% (3W), 3.3 wk. WR -25.8% / -23.8%, 3.1 wk, re-injury 10%. TE -54.0% / -16.8%, 3.8 wk.
- Combined ACL+MCL: **Bakshi 2018** (Sports Health; multi-ligament knee injuries, n=50): ACL/MCL RTP 70.8% at 305 +/- 59 d; 43.5% returned to prior performance. These numbers come from the abstract as reported in search results.
- Soccer UEFA data (grade 1 median 13.5 d, grade 2-3 median 29 d) is **not NFL**. Listed for context only.

### 2.7 Meniscus

- **Aune 2014** (AJSM; 77 partial lateral meniscectomies): 61% returned to their prior level at a mean 8.5 mo; 40% still active at follow-up. Speed-position players were 4.0x less likely to return; top-4-round picks 3.7x more likely.
- **Brophy 2009**: ACL reconstruction plus meniscectomy shortened careers. No in-season "scope and return in 2-4 weeks" performance data for skill players was found. Effect on fantasy output is **unknown**.

### 2.8 Lisfranc

- **McHale 2016** (AJSM; 2000-2010; n=28, 11 offensive): RTP 92.9% at median 11.1 mo; median 8.5 regular-season games missed.
- **Abed 2023** (OJSM; 2009-2020; n=33, 7 RB): RTP 81.8% at median 11.0 mo. **AV median 6.0 -> 5.0 at 1 yr (P=.022).** Snaps, games and starts were not different from before.

### 2.9 Jones fracture / foot fractures

- **Lareau 2016** (FAI; single surgeon; 25 NFL players; 8 WR, 4 TE): RTP 100%; same-season RTP 8.7 wk (range 5.9-13.6). **Refracture 12% (3/25).**
- **Luo 2023** (Sports, systematic review; 6 studies, 285 fractures): RTP 100%, 6-27 wk. **Refracture 4-12%**; incomplete healing 7-50%.
- **Parekh & Shah 2017** (OJSM poster abstract; 42 Jones fractures 2010-2015): return at <=10 wk had **-53.2%** performance and 9/15 needed a second surgery. Return at >10 wk had **+9.4%** and 4/27 second surgeries. Small n and unpublished as a full paper, so treat as suggestive only.

### 2.10 Turf toe

- **Tran 2019** (Iowa Orthop J; 2010-2015; 24 injured vs 436 controls): 19/24 returned the same season at a mean 36.7 d. **No significant 1-yr change in Offensive PR vs controls.**
- **Madi 2023** (J Foot Ankle Surg; 2011-2014; 71 injuries): PR/game 7.3 before, 6.9 in the injury season, **8.1 after**. No significant difference vs baseline or controls.
- **Lindsey et al. 2020** (Foot Ankle Orthop abstract; 53 high-grade cases):
  - Non-operative: RTP 100% at 75.8 d.
  - Operative: RTP 80% at 221.4 d; none returned the same season.
  - **Skill players back to their prior level: 78% non-op vs 27% op (P=.032).** Confounded by severity.

### 2.11 Calf strain

- **Zofkie & Gallo 2024** (OJSM poster; 2013-2022; 349 strains / 294 players): 83.7% returned the same season; mean 1.97 games missed. "No significant changes in player performance from pre to post-injury" among same-season returners. **20.7% later calf or Achilles injury.** WRs had the most cases (48).
- 4for4 (blog): RB -35.9% (1W), -45.5% (1WM), **-41.1% (3W)**, 2.3 wk. WR -33.1% / -36.9% / -14.1%, 1.8 wk, re-injury 18.1%. Small cells; this conflicts with the poster.

### 2.12 Groin / adductor / core-muscle (sports hernia)

- **Jack 2017** (OJSM; 56 players / 57 surgeries): 53 returned. **No pre vs post performance difference and no difference vs controls.** Fewer games per season after surgery (12.0 vs 14.0) and shorter careers (3.2 vs 3.8 yrs).
- **Lynch 2017** (OJSM abstract; n=32): no significant performance change after surgery; Pro Bowls 8 before -> 3 in the season after.
- **NO-SOD**: sports hernia repair RTP 90-96%.
- **Schlegel 2009** (AJSM; adductor longus ruptures, n=19): 100% RTP. Non-op 6.1 +/- 3.1 wk; op 12.0 +/- 2.5 wk.
- 4for4 (blog): WR groin -28.7% (1W), -35.8% (1WM), -14.8% (3W), re-injury 17.4%. TE -14.8% (1W). Chona: "most core injuries wouldn't cause any noticeable production dip".

### 2.13 Concussion

- **Kumar 2014** (AJSM; 2008-2012; 131 concussions; PFF grades; player had to play >=4 games before and after): **no change before vs after**, whether or not games were missed.
- **Reams 2017** (IJSPP; 2007-2010; 140 concussed skill players vs 57 with other head/neck injuries; DYAR fixed effects): **back at baseline on return**. DYAR dipped 1-2 weeks _before_ the player appeared on the injury report.
- **Jildeh 2019** (AJSM; RB/WR 2012-2015; n=38): 89% returned the same season after 1.5 +/- 0.9 games. PR change vs controls: -1.2 vs -1.1 (+/-1 yr, P=.199) and -3.6 vs -3.0 (+/-3 yr, P=.219), so **no difference**.
- **Navarro 2017** (OJSM; 2005-2016; 307 concussed players): shorter careers; offensive players showed lower performance scores. This is career-level, not per game.
- **Wasserman 2024** (BJSM; NFL league data 2015-2021): later lower-extremity injury HR 1.12 (0.90-1.41), not significant. **Jildeh 2021** (OJSM): concussion not associated with acute non-contact lower-extremity injury.
- 4for4 (blog, conflicting):
  - RB -14.2% (1W), -6.2% (3W). WR -23.2% (1W), -10.7% (3W), re-injury 8.1%. TE -15.4% (1W), +6.1% (3W).
  - QB +6.9% (1W), +19.8% (3W).

### 2.14 Shoulder

- **Okoroha 2018** (JSES; 83 in-season instability events):
  - 92% returned.
  - Non-op: median return 0 wk (subluxation) or 3 wk (dislocation). Surgery: 39.3 wk.
  - **Recurrence 47% overall: 55% non-op vs 26% op**; time to the next event 2.5 vs 14.7 wk.
- **Dillon 2026** (OJSM; 2015-2024; 111 labral repairs; 60 matched 1:2 on snap rate): RTP 86.5% at median 265 d. **No usage change vs controls.** Offensive grades trended lower (P=.09).
- **Lynch 2013** (AJSM; NFL Injury Surveillance 2000-2011): 727 AC injuries, 29% of all shoulder injuries. Mean 9.8 d lost; **QB 17.3 d**. Only 1.7% surgical, and those lost 56 d.
- 4for4 (blog): QB shoulder -15.5% (1W), -5.9% (3W), re-injury 20%. AC re-injury RB 22.2%, WR 28.6%.

### 2.15 Back / spine

- **Hsu 2010** (Spine; 137 lumbar disc herniations, 96 surgical): RTP 78% after surgery. Surgical players played 36 games afterwards vs 20 for non-surgical. **No pre vs post performance difference.**
- **Dupont 2023** (Clin Spine Surg; n=101): 74% returned. PFF grade unchanged (P=.2). Contracts fell.
- **O'Malley 2025** (Cureus; 144 procedures 2005-2022): lumbar RTP 61%, rating +6.3%. **Cervical RTP 47%, rating -5.8%.** Skill players more often had neck procedures.
- **Kajy 2022** (fantasy; NFL n=14): RTP 9/14.
- In-season back strain: 4for4 QB -38.9% in G1 (tiny n). No study found.

### 2.16 Fractures (clavicle, forearm, hand, ankle, tibia, fibula)

- Clavicle:
  - **Vora 2019** (CJSM; n=17): back at median 3.47 mo; 8 games missed; **no performance effect vs controls**.
  - **Jack 2017 non-op** (n=30): RTS 96.9% at 245 d; no differences vs controls.
  - **Jack 2017 ORIF** (n=16): RTS 94.1% at 211 d; 44% same season. **QB (n=3) and RB (n=5) worse than controls.**
- **Forearm ORIF** (Sochacki 2018; n=36): 33 returned at 152 d; **no performance change**; about 2 fewer games per season.
- **Metacarpal** (Sharareh 2023; 208 injuries 2012-2018): **median RTP 15 d**; 71% returned the same season. Non-op 16 d, op 20 d. Thumb: non-op 55 d vs op 24 d.
- **Ankle fracture ORIF** (Robbins 2022; n=31): RTP 71%; ~98 d on IR. **No change in AV or snaps/game at 1-2 seasons** vs pre or controls. Non-returners had 42.6% lower pre-injury AV.
- **Tibia (intramedullary nail)** (NO-SOD): high RTP; lower performance in season 1, then back to baseline. A fantasy review cites "-29.1%" for tibial fractures (n=14, 2015-2023), but the primary source was not located, so **unverified**.
- **Open vs closed fractures** (Nudelman 2023; n=95): no difference in performance after return.
- **Fibula, ribs, wrist (non-op)**: no NFL performance studies found. 4for4 shows QB rib +37% (noise).

### 2.17 Other with NFL data

- **Patellar/quad tendon rupture**:
  - NO-SOD: patellar tendon RTP **50%**, the worst for RTP, career length and performance.
  - **Choudhry 2025** (n=74): RTP 56.8% at median 11.3 mo; AV reductions persist into season 2.
- **Elbow/thumb UCL in QBs** (Quinn 2024; n=21): 16/20 returned. **Older age linked to worse performance after the injury.**
- **Any QB surgery** (Gadbois 2026, Cureus; n=73 QBs 2006-2022): return to pre-injury peak was about **94% (fantasy points)**, 107% (QBR) and 97% (passer rating). Not significant (Cohen's d -0.19 to 0.10).

---

## 3. Moderators

| Moderator                            | Evidence                                                                                                                                                                                                                                                                   | Direction / size                                                                              | Strength                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Position: QB**                     | ACL (Erickson 2014; Burgess 2022; Mody 2022: -2%); ankle (Bergstein 2024: n.s.); any surgery (Gadbois 2026: 94% of fantasy peak)                                                                                                                                           | QBs largely unaffected after major lower-body injury                                          | Moderate-strong                                |
| **Position: RB**                     | ACL (Carey -34%/game; Burgess within-player -48% vs controls -16%; Mody -90.5% totals; Manoharan YPC 4.45->3.42); Achilles (Jack, Barton, Parekh); high ankle (4for4 3W -22%; Betz 11/13 below in G1)                                                                      | Largest and most persistent declines after lower-limb injuries                                | Moderate-strong                                |
| **Position: WR**                     | Hamstring recurrence highest (Bodendorfer: WR is a same-season risk factor); Achilles RTP 38% (Barton); ACL receptions/game -32% (Manoharan) but per game unchanged in Burgess 2021                                                                                        | Re-injury risk is the main WR effect                                                          | Moderate                                       |
| **Age / tenure**                     | Cohn 2025: full ACL recovery 24% young vs 12% older. DeFroda: older age predicts failure to return (high ankle). Quinn 2024: older QBs worse after UCL. Bodendorfer: longer experience predicts hamstring recurrence. Chona: older RBs get fewer touches after a hamstring | Older means worse and more re-injury                                                          | Moderate (consistent direction, small effects) |
| **Pre-injury quality**               | Shah 2010 and Aune 2014: early draft picks return more often (3.7x). Robbins 2022: ankle-fracture non-returners had 42.6% lower AV. Cohn: higher pre-injury score predicts better recovery (rho 0.90) and faster return                                                    | Fantasy-relevant starters return more often than headline RTP rates suggest                   | Moderate                                       |
| **Workload before injury**           | Kraeutler 2017 (RBs 2004-2014): 300+ carry RBs did **not** get hurt more the next season (49% vs 66% missed >=1 game) and YPC was unchanged                                                                                                                                | No support for a "high touch volume, bigger decline" moderator                                | Moderate null                                  |
| **Surgery vs non-op**                | Turf toe: op 27% vs non-op 78% back to prior level (severity-confounded). Shoulder instability: op recurrence 26% vs 55% but ~39 wk out. Adductor: non-op 6 vs op 12 wk. Lumbar: surgical played more games                                                                | Surgery is a marker of severity and longer absence; within a season it usually means "out"    | Weak-moderate                                  |
| **Speed of return**                  | Hamstring: return within 2 wk gives highest recurrence (13.4%). Jones: return <=10 wk gives -53% performance and more refractures (poster). Betz: 7/8 high-ankle players who never got back to baseline were early (<=3 wk) returners                                      | Early returners carry more short-term risk                                                    | Moderate for hamstring, weak otherwise         |
| **Games missed as a severity proxy** | Angileri 2025: R^2=0.0047 between games missed and PPG change. Bergstein: RTP time not a significant covariate                                                                                                                                                             | Games missed does **not** predict post-return production                                      | Moderate null                                  |
| **In-season vs off-season**          | Achilles: 32-50% occur in preseason or camp (Jack, Butler), meaning a lost season. Extensor mechanism: preseason injuries have lower RTP (Choudhry)                                                                                                                        | Affects whether the player returns this season at all, not the size of the post-return effect | Moderate                                       |

---

## 4. What the evidence does NOT support

1. **A per-game drop after concussion.** Three peer-reviewed studies using different metrics agree: PFF grades (Kumar 2014), DYAR (Reams 2017), and PR vs controls (Jildeh 2019). Players are at baseline on return. The concussion-to-later-injury link is not significant in NFL league data (Wasserman 2024). 4for4's G1 dip (RB -14%, WR -23%) is unadjusted and reverses for QBs.
2. **Lasting effects of most surgeries outside the major tendons and ligaments.** Sports hernia/core (Jack 2017; Lynch 2017), lumbar discectomy (Hsu 2010; Dupont 2023), clavicle (Vora 2019; Jack 2017), forearm ORIF (Sochacki 2018), ankle-fracture ORIF (Robbins 2022), non-op turf toe (Tran 2019; Madi 2023) and labral repair usage (Dillon 2026) all show **no significant per-game change**. Their cost is fewer games and shorter careers, not lower output while playing.
3. **Lisfranc as a big production killer.** AV fell by about 1 point (median 6 to 5) with snaps unchanged (Abed 2023); RTP is 82-93%.
4. **QB decline after ACL or ankle injury.** Not significant in every study that split QBs out.
5. **The "year 2 after ACL" rebound for RBs.** Only 11% of RBs reached 85% of baseline by year 2 (Porras, blog). In Cohn's preprint, the 19% who fully recovered mostly did so within 2 seasons, so recovery that happens tends to happen early. The data do not support assuming a second-year bounce.
6. **Using time missed to scale the post-return effect.** Angileri found R^2=0.005; Bergstein's ANCOVA found no RTP-time effect.
7. **Pre-injury workload as a moderator.** Kraeutler 2017 is null.
8. **Uncontrolled pre/post declines as injury effects.** Burgess's healthy RB controls fell -16% in PPG the following year. Studies without controls (Desai 2022 -14%/game; Angileri 2025 -0.5 PPG; Parekh 2009; Mody 2022) partly measure regression to the mean and aging. Angileri's "-17.1 PPG for players with >3 years in the league" is implausible (larger than most players' PPG) and should be treated as an error.
9. **Precise per-injury short-term numbers.** The first-games-back figures come almost entirely from blogs: 4for4 (no n per cell, no control, no significance testing), Betz (n=35) and Provencher (methods unpublished). The direction is consistent. The magnitudes are noisy and sometimes contradict (WR high ankle: -16.5% in G1 but +11.4% over 3 games; calf: blog -41% vs poster "no change").
10. **Isolated MCL, meniscus (in-season scope), low ankle sprain, back strain, rib/fibula/wrist fractures.** No peer-reviewed NFL skill-position performance data exists.

### Survivorship and other biases (apply to all rows)

- Performance comparisons include only players who returned. Non-returners (ACL 21-44%, Achilles 19-43%) are dropped, and they skew toward lower pre-injury quality (Robbins 2022; Shah 2010). For fantasy starters, "conditional on return" is still the right quantity.
- Most cohorts come from public injury reports and media. Inclan 2022 (AJSM) specifically examined how valid public-data ACL research is.
- Sample sizes for skill positions are often in the single digits to the 30s per position.
- Metrics differ: AV, PR, PFF grade, DYAR, fantasy PPG (mostly standard, not PPR). Season totals mix "played less" with "produced less per game".

---

## 5. Short-term (first 1-4 games) vs long-term effects

- **Short term, for common in-season injuries:**
  - G1-back drops of about **-15% to -25%** vs the healthy average appear consistently for hamstring, high ankle, calf, groin and MCL at RB, WR and TE (4for4; Betz). Snap share drops about -34% in G1 after a hamstring (Provencher, unverified). Playing with a Q/D tag costs -18.6% (4for4).
  - **Hamstring dips mostly wash out within 3 games** (RB -4.5%, WR +0.7% over 3W). **RB high-ankle dips persist** (-22% over 3W; -14% to -21% for the rest of the season; Betz: ~2.5 games to baseline, 27% never reach it in-season).
  - So the short-term effect is **larger in % terms and more consistent in direction** than the next-season effect for common injuries. It is **less reliably measured**: no controls, no peer review, small cells. Part of it is mechanical: snap ramp-up, in-game re-aggravation, and players listed questionable.
- **Long term (next season):** reliable and large only for **ACL, Achilles and patellar tendon** (-20% to -50% per game for RB/WR, with controls). For common injuries, pooled next-season effects are small (Angileri -0.5 PPG, uncontrolled), except all-ankle -23% PPG (Bergstein, controlled).
- **Re-injury risk** is the best-measured short-term quantity: hamstring 12% same season, 33-38% eventually, highest when the player returns within 2 weeks. It is relevant to expected games played rather than per-game output.

---

## 6. References

Peer-reviewed (PubMed URL = https://pubmed.ncbi.nlm.nih.gov/<PMID>/)

- Abed V, et al. Return to Play, Performance, and Economic Analysis of NFL Players After Lisfranc Injury. Orthop J Sports Med. 2023. PMID 37056454.
- Angileri HS, et al. The Use of Fantasy Points to Evaluate Return-to-Play Performance After Time-Loss Injuries in the NFL. Cureus. 2025. PMID 41552261; PMC12804431. doi:10.7759/cureus.99333.
- Aune KT, et al. Return to Play After Partial Lateral Meniscectomy in NFL Athletes. Am J Sports Med. 2014;42(8):1865-1872. PMID 24914032.
- Bakshi NK, et al. Return to Play After Multiligament Knee Injuries in NFL Athletes. Sports Health. 2018. PMID 29638200. doi:10.1177/1941738118768812.
- Barton D, et al. Return to Play Following Achilles Tendon Rupture in NFL Players Based on Position. Foot Ankle Spec. 2023. PMID 34609159. doi:10.1177/19386400211040351.
- Bergstein VE, et al. Fantasy football points capture performance declines in NFL offensive skill players following an ankle injury. J Orthop. 2024. PMID 38596620; PMC10999692.
- Bodendorfer BM, et al. Recurrence of Hamstring Injuries and Risk Factors for Partial and Complete Tears in the NFL: 2009-2020. Phys Sportsmed. 2023. PMID 34878369.
- Brophy RH, et al. Effect of ACL reconstruction and meniscectomy on length of career in NFL athletes. Am J Sports Med. 2009. PMID 19875359.
- Burgess CJ, et al. Decreased Performance and Return to Play Following ACLR in NFL Wide Receivers. Arthrosc Sports Med Rehabil. 2021. PMID 34027455; PMC8129483.
- Burgess CJ, et al. NFL WRs and RBs Have Decreased Production Following ACL Reconstruction: Fantasy Football Performance as an Outcome Measure. Arthrosc Sports Med Rehabil. 2022. PMID 35494296; PMC9042763.
- Butler, Hedbany, Vargas, Kingery, Lin, Samsonov, Kennedy. Low Rates of RTP and Reduced Performance in NFL Athletes Following Acute Achilles Tendon Ruptures: A Systematic Review. Foot Ankle Orthop. 2024. PMC11682601.
- Carey JL, Huffman GR, Parekh SG, Sennett BJ. Outcomes of ACL injuries to running backs and wide receivers in the NFL. Am J Sports Med. 2006. PMID 16870822.
- Choudhry H, et al. Return to Play and Performance Outcomes After Extensor Mechanism Ruptures in NFL Athletes. Orthop J Sports Med. 2025. PMID 40416996.
- DeFroda SF, et al. Defining the contemporary epidemiology and return to play for high ankle sprains in the NFL. Phys Sportsmed. 2022. PMID 33906554.
- Desai SS, et al. Epidemiology and Outcomes of Ankle Injuries in the NFL. Orthop J Sports Med. 2022. PMID 35677018; PMC9168861.
- Dillon MR, et al. Return to Play, Performance, and Career Longevity After Shoulder Labral Repair in the NFL: A Matched Cohort Analysis. Orthop J Sports Med. 2026. PMID 42416048.
- Dupont MM, et al. Impact of Lumbar Disk Herniation on Performance Outcomes and New Contracts in the NFL. Clin Spine Surg. 2023;36(4):E139-E144. PMID 36127776.
- Elliott MC, Zarins B, Powell JW, Kenyon CD. Hamstring muscle strains in professional football players: a 10-year review. Am J Sports Med. 2011. PMID 21335347.
- Erickson BJ, et al. Performance and return-to-sport after ACL reconstruction in NFL quarterbacks. Orthopedics. 2014. PMID 25102509.
- Gadbois WJ, et al. Assessing Return to Performance After Surgery in NFL Quarterbacks. Cureus. 2026. PMID 42757209.
- Gadbois WJ, Cohn H, Vaidya R. Reframing Recovery: Fantasy Sports Metrics as Scalable Tools for Measuring Post-injury Athletic Performance. Cureus. 2025. PMID 41058837; PMC12498200.
- Hsu WK. Performance-based outcomes following lumbar discectomy in professional athletes in the NFL. Spine. 2010;35(12):1247-1251. PMID 20216340.
- Inclan PM, et al. Validity of Research Based on Public Data in Sports Medicine: ACL Injuries in the NFL. Am J Sports Med. 2022. PMID 34166138. (Title only; not read.)
- Jack RA, et al. Performance and Return to Sport After Achilles Tendon Repair in NFL Players. Foot Ankle Int. 2017. PMID 28742993.
- Jack RA, et al. Performance and Return to Sport After Sports Hernia Surgery in NFL Players. Orthop J Sports Med. 2017. PMID 28451612.
- Jack RA, et al. Performance and RTS After Clavicle ORIF in NFL Players. Orthop J Sports Med. 2017. PMID 28840146.
- Jack RA, et al. Performance and RTS After Nonoperative Treatment of Clavicle Fractures in NFL Players. Orthopedics. 2017;40(5):e836-e843. PMID 28776634.
- Jenkins R, et al. Risk and Prognosis of Hamstring Injuries in the NFL: A 12-Year Review. Orthop J Sports Med. 2024. PMID 39649523.
- Jildeh TR, et al. Effect of Concussions on the Performance of Running Backs and Wide Receivers in the NFL. Am J Sports Med. 2019. PMID 31386551.
- Jildeh TR, et al. Concussion in NFL Athletes Is Not Associated With Increased Risk of Acute, Noncontact Lower Extremity Musculoskeletal Injury. Orthop J Sports Med. 2021. PMID 34017880. (Title only.)
- Kajy M, et al. "Fantasy Points" associated with Professional Athlete Performance after Lumbar Discectomy. Spartan Med Res J. 2022. PMID 35291710.
- Kajy M, et al. Use of Fantasy Points in Evaluating Professional Athlete Performance After ACL Reconstruction. Cureus. 2023. PMID 37033596.
- Kraeutler MJ, Belk JW, McCarty EC. Effect of the Number of Carries on Injury Risk and Subsequent Season's Performance Among NFL Running Backs. Orthop J Sports Med. 2017. PMID 28321427.
- Kuhn AW, et al. Distal Tibiofibular Syndesmosis Injuries in the NFL. Sports Health. 2025. PMID 38804171.
- Kumar NS, et al. On-field performance of NFL players after return from concussion. Am J Sports Med. 2014. PMID 25008256.
- Lareau CR, Hsu AR, Anderson RB. Return to Play in NFL Players After Operative Jones Fracture Treatment. Foot Ankle Int. 2016;37(1):8-16. PMID 26353796.
- Lindsey BB, Bakshi NK, Walton DM, Holmes JR, Talusan PG. Return to Play Following High-Grade Turf Toe Injuries in NFL Athletes. Foot Ankle Orthop (abstract). 2020. PMC8705118.
- Luo EJ, et al. Jones Fracture in the NFL (systematic review). Sports (Basel). 2023;12(1):7. PMID 38251281.
- Lynch TS, et al. Acromioclavicular joint injuries in the NFL. Am J Sports Med. 2013. PMID 24057030.
- Lynch TS, et al. Performance-Based Outcomes after Operative Management of Athletic Pubalgia/Core Muscle Injury in NFL Players. Orthop J Sports Med (abstract). 2017. PMC5542316.
- Madi NS, Parekh TJ, Parekh SG. Outcome of Turf Toe Injuries in NFL Players. J Foot Ankle Surg. 2023;62(1):115-119. PMID 35697653.
- Mai HT, et al. The NFL Orthopaedic Surgery Outcomes Database (NO-SOD). Am J Sports Med. 2016. PMID 27311414.
- Manoharan A, et al. Return to Play Rates in NFL WRs and RBs After ACL Reconstruction: An Updated Analysis. Orthop J Sports Med. 2021. PMID 33553449; PMC7829540. doi:10.1177/2325967120974743.
- McHale KJ, et al. Outcomes of Lisfranc Injuries in the NFL. Am J Sports Med. 2016. PMID 27166291.
- Mody KS, Fletcher AN, Akoh CC, Parekh SG. Return to Play and Performance After ACLR in NFL Players. Orthop J Sports Med. 2022. PMID 35284583.
- Navarro SM, et al. Short-term Outcomes Following Concussion in the NFL. Orthop J Sports Med. 2017. PMID 29226164.
- Nudelman B, et al. Open Fractures in NFL Athletes. Spartan Med Res J. 2023. PMID 38084337.
- O'Malley GR, et al. Impact of Cervical and Lumbar Spine Surgeries on NFL Player Performance and RTP. Cureus. 2025. PMID 40642713.
- Okoroha KR, et al. Return to play after shoulder instability in NFL athletes. J Shoulder Elbow Surg. 2018. PMID 28941971.
- Parekh SG, et al. Epidemiology and outcomes of Achilles tendon ruptures in the NFL. Foot Ankle Spec. 2009. PMID 20400426.
- Parekh S, Shah J. Optimal Time to Return to Play and Performance after Jones Fracture Surgery in the NFL. Orthop J Sports Med (poster abstract). 2017. PMC5542311.
- Prempeh AGA, et al. Impact of Achilles tendon rupture on performance and career outcomes in NFL players: a matched cohort study. Phys Sportsmed. 2026. PMID 42206389.
- Quinn M, et al. NFL Quarterbacks With UCL Injuries... Arthrosc Sports Med Rehabil. 2024;6(4):100954. PMID 39421341.
- Reams N, Hayward RA, Kutcher JS, Burke JF. Effect of Concussion on Performance of NFL Players. Int J Sports Physiol Perform. 2017. PMID 28095082.
- Robbins J, et al. Return to Play and Performance Measures for NFL Athletes Following Operative Ankle Fractures. Foot Ankle Orthop (abstract). 2022. PMC9679823.
- Schlegel TF, et al. Success of nonoperative management of adductor longus tendon ruptures in NFL athletes. Am J Sports Med. 2009. PMID 19329786.
- Shah VM, et al. Return to play after ACL reconstruction in NFL athletes. Am J Sports Med. 2010. PMID 20610771.
- Sharareh B, et al. Metacarpal Fractures in the NFL. J Hand Surg Am. 2023;48(6):626.e1-626.e8. PMID 35440404.
- Sochacki KR, et al. Performance and RTS After Forearm Fracture ORIF in NFL Players. Hand (N Y). 2018;13(6):682-688. PMID 28825344.
- Tran A, et al. The Effect of Turf Toe Injuries on Player Performance in the NFL. Iowa Orthop J. 2019. PMID 32577105.
- Vora D, Baker M, Pandarinath R. Impact of Clavicle Fractures on Return to Play and Performance Ratings in NFL Athletes. Clin J Sport Med. 2019;29(6):459-464. PMID 31688175.
- Wasserman EB, et al. Subsequent musculoskeletal injury after concussion in NFL players. Br J Sports Med. 2024. PMID 39122368.
- Yang J, et al. NFL Skilled and Unskilled Positions Vary in Opportunity and Yield in RTP After ACL Injury. Orthop J Sports Med. 2017. PMID 28975136.
- Ziedas A, et al. Full RTS After Suture-Button Fixation for Syndesmotic Injuries... Arthrosc Sports Med Rehabil. 2025. PMID 41541541.
- Zofkie W, Gallo R. Poster 388: Calf Strains in the NFL. Orthop J Sports Med. 2024;12(7 suppl 2). PMC11465317.

Preprint

- Cohn H, Gadbois W, Boggs L, Vaidya R. Return to Pre-Injury Performance, Not Just Return to Play: ... ACL Reconstruction Using Fantasy Football Scores. Research Square. 2025. doi:10.21203/rs.3.rs-7871147/v1.

Fantasy-industry / media (not peer-reviewed)

- Hutchison A. The 4for4 Fantasy Football Injury Index: How Do Injuries Affect Player Performance? 4for4, 2022-09-09. https://www.4for4.com/2022/preseason/4for4-fantasy-football-injury-index-how-do-injuries-affect-player-performance
- Betz M. High Ankle Sprains & Their Effect on Fantasy Performance. The Fantasy Footballers, 2022-05-04. https://www.thefantasyfootballers.com/articles/high-ankle-sprains-their-effect-on-fantasy-performance-fantasy-football/
- Betz M. The Impact of ACL Surgery on Fantasy Performance: Running Backs. The Fantasy Footballers, 2022-08-05. https://www.thefantasyfootballers.com/analysis/the-impact-of-acl-surgery-on-fantasy-performance-running-backs/
- Porras E. Welcome Back and the "Second Year ACL" Myth. Injury Prone newsletter, 2023-06-01. https://injurypronenewsletter.beehiiv.com/p/welcome-back-second-year-acl-myth
- Chona D (SportsMedAnalytics). FantasyPros Week 7 2023 injury report; Top 10 Injuries to Know for 2023 drafts. https://www.fantasypros.com/2023/10/week-7-fantasy-football-injury-report/ ; https://www.fantasypros.com/2023/08/top-10-injuries-to-know-for-your-fantasy-football-draft-2023/
- Provencher M. NFL Injuries: Why hamstring ailments are common for skill-position players. Fox Sports, 2021-10-26. https://www.foxsports.com/stories/nfl/nfl-injuries-why-hamstring-ailments-are-common-for-skill-position-players
