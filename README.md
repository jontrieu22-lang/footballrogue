# Football Rogue

A single-player or two-player, turn-based football card game. Build a team from a dealt hand, call hidden plays, and improve your lineup between rounds.

This replaces the former franchise simulator. The old game remains in Git history, not as another mode.

## Play

```sh
npm ci
npm run ui
```

Open the local URL and choose **Play against CPU** for solo play, or **Two players · pass & play** to share the device. The CPU drafts its own roster, commits its calls before yours, and automatically chooses up to one upgrade each round. Handoff screens hide cards and calls from casual viewing. This release is **solo vs CPU and local pass-and-play**, not online multiplayer. Refreshing starts a new session; there is no autosave yet.

1. Each player receives 10 universal athlete cards with nine stats. Assign four offense and four defense; discard two.
2. Offense secretly chooses one of six plays. Hand the device over for defense to choose one of four formations. Reveal and resolve.
3. Four downs to gain ten yards. Touchdowns score seven; fourth-down field goals score three with distance-based odds.
4. Both players receive one possession per round, starting at the opponent’s 45-yard line (college-overtime-inspired). First to 21 wins only after equal possessions, with a lead.
5. Between rounds, each player receives three new cards and may replace one starter. Rearrange positions freely, then lock the roster.
6. First possession alternates. After eight rounds, a leader wins; ties continue with paired possessions from the opponent's 20.

## Development

```sh
npm test
npm run typecheck
npm run ui:build
```

- `src/game.ts`: pure card, roster, play, kicking, and match rules.
- `web/src/App.tsx`: private handoffs, roster builder, field, play calls, results, upgrades.
- `tests/game.test.ts`: rules and state transitions.
- `DESIGN.md`: current rules and balance assumptions.

React + TypeScript + Vite. No account, backend, or external game service is required. Probabilities are initial game-balance values, not NFL statistical estimates.

Every snap now plays a short on-field card animation before the result. Cards show routes, blocking and pursuit; the ball follows runs, passes, turnovers and kicks. Skip moves directly to the same precomputed result. System reduced-motion preferences use a short static outcome view.

## Reading your opponent

The scouting panel counts the opponent's last five revealed calls on the relevant side of the ball. It never displays the current hidden call. Offensive play cards show OL-vs-DL and runner/receiver matchup edges from your ratings and scouted opponent bounds before formation and safety effects. These are matchup comparisons, not win probabilities.

Upgrade offers recommend a role using weighted role fit. Select an offer to compare its relevant stat gains and losses against all eight starters before replacing anyone. CPU calls respond gradually to recent revealed runs, deep passes, blitzes, and coverage calls while retaining variety.

## Gradual scouting
Opponent names and positions are visible, but ratings start unknown. Each involved stat progresses through a lower bound, a bounded range, and its exact rating on the third observation. Sacks reveal only blocking/rush involvement; field goals reveal no athlete stats. Knowledge follows card identity across position changes and rounds; incoming cards start unknown. Matchup reads stay uncertain when bounds overlap. Result text and animations do not expose hidden ratings or derived probabilities. CPU defensive choices use the same knowledge bounds, while CPU offense uses its own team ratings and revealed call history. This is game information hiding, not protection against inspecting local browser memory.
