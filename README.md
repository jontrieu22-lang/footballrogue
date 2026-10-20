# Football Rogue

A single-player or two-player, turn-based football card game. Build a team from a dealt hand, call hidden plays, and improve your lineup between rounds.

This replaces the former franchise simulator. The old game remains in Git history, not as another mode.

## Play

```sh
npm ci
npm run ui
```

Open the local URL and choose **Play against CPU** for solo play, or **Two players · pass & play** to share the device. The CPU drafts its own roster, commits its calls before yours, and automatically chooses up to one upgrade each round. Handoff screens hide cards and calls from casual viewing. This release is **solo vs CPU and local pass-and-play**, not online multiplayer. Refreshing starts a new session; there is no autosave yet.

1. Each player receives 12 universal athlete cards with nine stats. Assign five offense and five defense; discard two.
2. Offense secretly chooses one of six plays. Hand the device over for defense to choose one of five formations. Reveal and resolve.
3. Four downs to gain ten yards. Touchdowns score seven; fourth-down field goals score three with distance-based odds.
4. Both players receive one possession per round. First to 21 wins only after equal possessions, with a lead.
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
