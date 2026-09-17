/** Trimmed nflverse-shaped CSVs. Column names are real; values are invented for exact assertions. */

export const playerStatsCsv = `player_id,player_name,player_display_name,position,position_group,headshot_url,season,week,season_type,game_id,team,opponent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,fg_made,fg_made_list,fantasy_points_ppr
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"https://x/img?f_auto,q_auto",2025,1,REG,2025_01_DAL_PHI,PHI,DAL,0,0,0,0,0,18,60,1,4,5,24,0,0,,20.4
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"https://x/img?f_auto,q_auto",2025,2,REG,2025_02_PHI_KC,PHI,KC,0,0,0,0,0,22,88,0,2,3,10,0,0,,11.8
00-0036322,J.Jefferson,Justin Jefferson,WR,WR,"",2025,1,REG,2025_01_MIN_CHI,MIN,CHI,0,0,0,0,0,0,0,0,4,7,68,0,0,,10.8
00-0025565,N.Folk,Nick Folk,K,SPEC,"",2025,1,REG,2025_01_NYJ_PIT,NYJ,PIT,0,0,NA,0,0,0,0,0,0,0,0,0,1,45,0
,J.Nobody,John Nobody,WR,WR,"",2025,1,REG,2025_01_A_B,A,B,0,0,0,0,0,0,0,0,0,0,0,0,0,,0
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"",2025,19,POST,2025_19_GB_PHI,PHI,GB,0,0,0,0,0,20,100,1,1,1,5,0,0,,17.5
`

export const teamStatsCsv = `season,week,team,season_type,game_id,opponent_team,passing_yards,sack_yards_lost,rushing_yards,def_sacks,def_interceptions,def_tds,timeouts
2025,1,PHI,REG,2025_01_DAL_PHI,DAL,220,12,150,3,1,0,3
2025,1,DAL,REG,2025_01_DAL_PHI,PHI,300,20,80,1,0,1,2
2025,1,LA,REG,2025_01_HOU_LA,HOU,180,5,120,4,2,1,3
2025,1,HOU,REG,2025_01_HOU_LA,LA,250,30,60,2,0,0,1
`

export const snapCountsCsv = `game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct
2025_01_DAL_PHI,202509040phi,2025,REG,1,Saquon Barkley,BarkSa00,RB,PHI,DAL,55,0.83,0,0,2,0.07
2025_02_PHI_KC,202509140kan,2025,REG,2,Saquon Barkley,BarkSa00,RB,PHI,KC,60,0.9,0,0,0,0
2025_01_DAL_PHI,202509040phi,2025,REG,1,Ghost Player,,RB,PHI,DAL,1,0.01,0,0,0,0
`

export const gamesCsv = `game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location
2025_01_DAL_PHI,2025,REG,1,2025-09-04,Thursday,20:20,DAL,20,PHI,24,Home
2025_01_HOU_LA,2025,REG,1,2025-09-07,Sunday,16:05,HOU,9,LA,14,Home
2025_02_PHI_KC,2025,REG,2,2025-09-14,Sunday,16:25,PHI,20,KC,17,Home
2025_03_DAL_CHI,2025,REG,3,2025-09-21,Sunday,16:25,DAL,,CHI,,Home
2025_19_GB_PHI,2025,WC,19,2026-01-10,Saturday,16:30,GB,,PHI,,Home
`

export const crosswalkCsv = `mfl_id,sportradar_id,fantasypros_id,gsis_id,pff_id,sleeper_id,nfl_id,espn_id,yahoo_id,fleaflicker_id,cbs_id,pfr_id,cfbref_id,rotowire_id,rotoworld_id,ktc_id,stats_id,stats_global_id,fantasy_data_id,swish_id,name,merge_name,position,team,birthdate,age,draft_year,draft_round,draft_pick,draft_ovr,twitter_username,height,weight,college,db_season
13604,sr-1,17240,00-0034844,45164,4866,NA,3929630,NA,NA,NA,BarkSa00,saquon-barkley-1,NA,NA,NA,NA,NA,NA,NA,Saquon Barkley,saquon barkley,RB,PHI,1997-02-09,29.6,2018,1,2,2,NA,72,233,Penn State,2026
14836,sr-2,19236,00-0036322,NA,6794,NA,4262921,NA,NA,NA,JeffJu00,NA,NA,NA,NA,NA,NA,NA,NA,Justin Jefferson,justin jefferson,WR,MIN,2000-06-16,26.3,2020,1,22,22,NA,73,195,LSU,2026
15281,sr-3,NA,00-0037248,NA,NA,NA,NA,NA,NA,NA,CookJa01,NA,NA,NA,NA,NA,NA,NA,NA,James Cook,james cook,RB,BUF,1999-09-25,27,2022,2,31,63,NA,71,190,Georgia,2026
16000,NA,NA,00-0036900,NA,NA,NA,NA,NA,NA,NA,ChasJa00,NA,NA,NA,NA,NA,NA,NA,NA,Ja'Marr Chase,jamarr chase,WR,CIN,2000-03-01,26.5,2021,1,5,5,NA,72,201,LSU,2026
16001,NA,NA,NA,NA,9509,NA,NA,NA,NA,NA,RobiBi01,NA,NA,NA,NA,NA,NA,NA,NA,Bijan Robinson,bijan robinson,RB,ATL,2002-01-30,24.6,2023,1,8,8,NA,71,215,Texas,2026
16002,NA,NA,WAS569019,NA,13305,NA,NA,NA,NA,NA,WashMi21,NA,NA,NA,NA,NA,NA,NA,NA,Mike Washington Jr.,mike washington,RB,LVR,2003-05-01,23.4,2026,7,230,230,NA,72,220,Ohio,2026
`
