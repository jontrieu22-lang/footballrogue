# Football Rogue

A browser-based, Madden-flavored **roguelike** where you run an NFL-style
franchise one season at a time.

You are a head coach on a short leash. Build a roster, pick schemes that
counter your opponents, survive the draft, and win games — or ownership
finds someone who can. Each season is a run.

## What kind of game is this?

It looks like a football management sim, but the structure is a roguelike:

| Roguelike convention | Football Rogue's version |
|---|---|
| Procedurally generated dungeons | Every league, roster, and draft class is generated fresh per run — no two franchises see the same league |
| Permadeath | Career-ending injuries are permanent, and enough losing gets you **fired** — the run ends |
| Risk/reward encounters | Play-calling, fake punts, and other in-game gambles are the moment-to-moment decisions |
| Run structure | One season (17 games + playoffs + draft) = one run |
| Meta-progression | What you bank when a run ends survives into the next franchise |
| Escalating difficulty | The better your all-time reputation, the sharper the league gets |

The "dungeon" is the season. The "monsters" are the 31 other teams. Your
"health bar" is ownership's patience, and the failure state is real: miss
expectations enough and you're out.

## Core loop

```
Preseason: review roster, set your offensive/defensive scheme
     │
     v
Regular Season (17 weeks): play each week, read the box scores,
injury report, and standings, spend player development points
     │
     v
Playoffs → Ownership review (patience up or down)
     │
     v
Offseason: draft a procedurally generated rookie class
(worst record picks first, scouting fog hides true ratings)
     │
     v
Patience hits zero? ──> RUN OVER — bank meta progress, start a new franchise
     │ no
     └──> next season
```

## What makes it deep

- **Schemes that counter each other.** Offense and defense schemes form a
  soft rock-paper-scissors web, and each scheme rewards different player
  traits — a zone corner is wasted in a blitz-heavy man defense.
- **Madden-style two-tier player cards.** General physical traits (speed,
  strength, awareness) plus positional skill groups (route running, pass
  rush, coverage) that only exist where they matter.
- **Skill trees per position.** Players earn development points from
  expected points added, then specialize through a three-tier tree.
- **Scouting fog of war.** Draft prospects show what your scouts *think*
  they're worth, not the truth — and upgrades to your scouting network
  narrow the error.
- **A sim that respects football.** Play-by-play drives with real field
  position, fourth-down decisions, field-goal range, clock management, and
  expected points. Calibrated against real NFL rates.

## Play it

```sh
npm install
npm run ui        # open the game in your browser (localhost:5173)
```

There's also a headless demo of the sim engine:

```sh
npm run demo      # simulates a season and prints a box score + standings
```

## Development

```sh
npm test          # 112 unit tests across the sim, draft, and franchise loop
npm run typecheck # TypeScript, no emit
npm run sanity    # balances the sim against real NFL rates (points, yards,
                  # possession counts, scheme-fit and development value)
npm run value     # checks positional value ordering (QB should dominate)
npm run develop   # shows how much player development is worth in wins
npm run cards     # prints sample player cards
```

## Tech stack

- **React + TypeScript + Vite** for the UI (`web/`)
- The **simulation engine is pure TypeScript** and framework-agnostic, so it
  runs headless in tests and balance scripts as well as in the browser
- All state is client-side, persisted to `localStorage` — no backend needed
- No real player names or likenesses: every team and player is original and
  procedurally generated

## Project layout

```
src/
  generators/   league, team, and player generation (all procedural)
  models/       player cards, attributes, archetypes, skill trees, team/league
  sim/          drive engine, play calling, game sim, season, playoffs,
                standings, schedule, expected points
  schemes.ts    the scheme counter web and scheme-fit reweighting
  draft/        draft room logic and procedural draft classes
  progression/  skill development, injuries, AI development spending
  franchise/    the roguelike run frame: patience, firing, offseason, saves
web/            React front end
scripts/        balance and measurement scripts (sanity, value, develop)
tests/          vitest suite
DESIGN.md       full game design document
```

## Status

The game is fully playable end to end: headless sim core, matchup-driven
play engine, schemes, skill trees, procedural draft, and the complete
franchise loop in the browser. The remaining roadmap work is the
cross-run meta layer (banked progression and difficulty scaling) and the
trade window. See `DESIGN.md` for the full picture.
