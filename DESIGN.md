# Football Rogue — card tactics

## Scope
A fresh replacement for the old franchise simulator. Play solo against a CPU or with two humans on one shared device. Online rooms, persistence, progression currencies, seasons, injuries, and contracts are outside this version.

## Cards and roster
Each player receives 10 generated cards. Every card has all nine stats, each 1–10, totaling 45 points: passing, rushing, catching, pass blocking, run blocking, coverage, tackling, pass rushing, run defense. Assign eight unique cards to QB, RB, WR, OL, DL, LB, CB, Safety. Discard the other two. Every card can fill any slot. Locked rosters are public; opening hands and upgrade offers are private behind handoff screens.

## Match
College-overtime-inspired rounds start each possession at the opponent’s 45-yard line (a 62-yard field goal, 35% chance before gaining ground). Four downs to gain ten yards; seven-point touchdowns, no extra-point roll. Interceptions and failed fourth downs end the possession. Safeties award two points to defense. No return touchdowns, punts, fumbles, or fake kicks yet. Both teams get one possession per round, alternating which player starts each round. Check victory only after the pair: at least 21 points and a lead wins. After round eight, a lead wins regardless of target; ties continue from the opposing 20 with equal possessions. This cap is provisional for playtesting.

## Field goals
Available on fourth down. Attempt distance = distance to goal line + 17. Both players use identical odds. 30 or less: 98%; 35:95%; 40:90%; 45:85%; 50:80%; 55:65%; 60:45%; 65:20%. Linear interpolation between distances, unavailable above 65. Make scores three; miss scores zero; either ends the possession. Defense does not submit a formation against a kick.

## Calls
Offense privately commits, then defense privately commits. Reveal together. Six offensive choices: Inside Run, Outside Run, QB Keep, Quick Pass, Screen, Deep Pass. Defense: Balanced, Run Stop, Blitz, Pass Coverage. Defensive roles change by call; safety commits to run support or coverage, and blitzing sends the LB alongside DL.

Runs use 60% OL run-blocking vs DL run-defense edge plus 40% carrier rushing vs tackling edge, plus 2d3−4 execution. Inside and outside runs use RB; QB Keep uses QB. Tackling uses LB with safety help: 20% in Balanced/Blitz, 45% plus a one-point bonus in Run Stop, none in Pass Coverage. Blitz incurs a one-point tackling penalty. Inside runs have narrower yardage bands than outside runs.

Passes check OL pass blocking against DL pass rush; Blitz uses 65% DL + 35% LB pass rush plus 1.5. Then compare 55% QB passing + 45% target catching against CB coverage, with safety help (20% normally, 45% in Pass Coverage, none in Run Stop). Screens target RB; other passes target WR. Deep coverage improves deep-pass resistance at the cost of run support. Blitz exposes screens. Tackling limits gains after the catch. No carrier or receiver also supplies blocking in the same calculation.

The engine reports the relevant matchup or odds with every result. No team-overall shortcut. All weights and odds are provisional and need human balance testing.

## Upgrades
After each unfinished round, independently deal three cards to each player. Choose up to one to replace a starter or skip. Offers have the same 45-point budget as opening cards. No bench; replaced and unchosen cards are discarded. Rearrange existing cards freely. Both teams lock before the next snap.

## Future online boundary
Local handoffs are privacy UX, not a security boundary: browser memory contains both hands. Online multiplayer will require server-owned hands, randomness and match state, authenticated seats, private action submissions, and reconnect support. Do not expose this client state as a competitive online protocol.

## CPU mode
The CPU uses exact assignment optimization to build its eight-card roster from ten cards, prioritizing role-specific stats. Between rounds it evaluates the existing team and each offered card separately, so it can acquire at most one. Calls are varied with weighted randomness based on public roster strengths and down/distance. The CPU commits its call before the human chooses, never inspecting the human’s hidden choice. Fourth-down kicking uses the same odds as human play. Solo mode has no handoff screens; the human controls both their offense and defense.
