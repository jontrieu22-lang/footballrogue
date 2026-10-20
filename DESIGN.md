# Football Rogue — card tactics

## Scope
A fresh replacement for the old franchise simulator. Two humans play locally on one shared device. Online rooms, persistence, AI opponents, progression currencies, seasons, injuries, and contracts are outside this version.

## Cards and roster
Each player receives 12 generated cards. Every card has all nine stats, each 1–10, totaling 45 points: passing, rushing, catching, pass blocking, run blocking, coverage, tackling, pass rushing, run defense. Assign ten unique cards to QB, RB, WR, Flex, OL, CB, LB, DL, Safety, Wildcard. Discard the other two. Every card can fill any slot. Locked rosters are public; opening hands and upgrade offers are private behind handoff screens.

## Match
Start each possession at midfield. Four downs to gain ten yards; seven-point touchdowns, no extra-point roll. Interceptions and failed fourth downs end the possession. Safeties award two points to defense. No return touchdowns, punts, fumbles, or fake kicks yet. Both teams get one possession per round, alternating which player starts each round. Check victory only after the pair: at least 21 points and a lead wins. After round eight, a lead wins regardless of target; ties continue from the opposing 20 with equal possessions. This cap is provisional for playtesting.

## Field goals
Available on fourth down. Attempt distance = distance to goal line + 17. Both players use identical odds. 30 or less: 98%; 35:95%; 40:90%; 45:85%; 50:80%; 55:65%; 60:45%; 65:20%. Linear interpolation between distances, unavailable above 65. Make scores three; miss scores zero; either ends the possession. Defense does not submit a formation against a kick.

## Calls
Offense privately commits, then defense privately commits. Reveal together. Six offensive choices: Inside Run, Outside Run, QB Keep, Quick Pass, Screen, Deep Pass. Defense: Balanced, Stack the Box, Contain / Spy, Blitz, Deep Coverage. Defensive roles change by call; wildcard strengthens the specialized matchup with an opportunity cost.

Runs use 60% blocking edge plus 40% carrier/tackling edge, plus 2d3−4 execution. Inside runs use RB, outside runs Flex, QB Keep QB. OL has the majority of blocking weight. Yardage comes from bounded outcome bands, with greater variance on outside runs.

Passes check sacks, then a mutually exclusive interception/completion/incompletion outcome. Protection uses OL and a supporting blocker; deep passes keep Flex in protection, screens use WR, and quick passes use RB. Passing quality is 55% QB passing and 45% target catching. Screens target Flex; other passes target WR. Coverage, formation, and play type affect probabilities. Tackling limits completed-pass yardage. These are abstract five-player football rules.

The engine reports the relevant matchup or odds with every result. No team-overall shortcut. All weights and odds are provisional and need human balance testing.

## Upgrades
After each unfinished round, independently deal three cards to each player. Choose up to one to replace a starter or skip. Offers have the same 45-point budget as opening cards. No bench; replaced and unchosen cards are discarded. Rearrange existing cards freely. Both teams lock before the next snap.

## Future online boundary
Local handoffs are privacy UX, not a security boundary: browser memory contains both hands. Online multiplayer will require server-owned hands, randomness and match state, authenticated seats, private action submissions, and reconnect support. Do not expose this client state as a competitive online protocol.
