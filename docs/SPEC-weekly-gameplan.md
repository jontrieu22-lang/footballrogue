# Spec: Weekly Game Plan — tempo, scheme grid, coach reads, halftime

Handoff spec for an agent with no prior context on this repo. Read
§0 before touching anything; the hazard in §0.3 is the one that
silently ruins work here.

---

## 0. What you need to know first

### 0.1 The project

`footballrogue` is a football-management roguelike. A pure-TypeScript
simulation engine lives in `src/`; a React front end in `web/` calls it
directly. No backend, no network. Work happens on branch
`claude/football-roguelike-game-1qn3mi`.

Commands:

```
npm run typecheck    # tsc --noEmit
npm test             # vitest, 112 tests
npm run sanity       # balance measurements vs real NFL rates
npm run value        # wins added per elite starter, by position
npm run ui           # dev server for the web app
```

### 0.2 How this codebase decides whether something works

Passing tests is not the bar. The bar is a set of **global balance
numbers** printed by `npm run sanity`. Current values:

| Measure | Current | Reference |
|---|---|---|
| Points per team per game | 21.8 | ~22 (NFL) |
| Corr(roster rating, wins) | 0.700 | 0.6–0.7 |
| Scheme fit worth | 3.10 wins/season | — |
| Development worth | 1.75 wins/season | — |
| Tie rate | ~0.15% | ~0.4% |

Every change below must leave these intact unless the step says
otherwise. Run `npm run sanity` before and after, and record both.

### 0.3 HAZARD: semantic conflicts

Twelve files hold hand-tuned balance constants (`src/sim/play.ts`,
`playCalling.ts`, `drive.ts`, `kicking.ts`, `gameSim.ts`,
`generators/*`, `progression/*`, `schemes.ts`, `playoffs.ts`).

A change can be locally correct, pass all 112 tests, merge cleanly, and
still degrade the game, because these numbers are only meaningful
relative to each other. **This work owns `playCalling.ts` and
`gameSim.ts`.** Do not run it concurrently with any other stream that
touches sim tuning.

### 0.4 Measurement style used here

Throughout this repo, a claim about behaviour is backed by a throwaway
script that measures it, not by reasoning. Write these into a scratch
directory (not the repo) unless the step says to make it permanent.
Pattern:

```ts
import { generateLeague } from "<abs path>/src/generators/leagueGenerator.js";
import { resetPlayerIdCounter } from "<abs path>/src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "<abs path>/src/generators/teamGenerator.js";
// resetPlayerIdCounter() + resetTeamIdCounter() before generating, or ids collide
```

Run with `npx tsx <file>`.

### 0.5 Design intent, in one paragraph

The player currently makes almost no in-season decisions — weeks are a
"Play Week" button. This feature adds a weekly game plan: pick an
offensive scheme, a defensive scheme, and a tempo. Tempo controls how
many possessions the game contains, which is a **variance dial**:
favourites want more possessions (their edge compounds), underdogs want
fewer (one lucky break is a larger share of the game). Whether you see
the opponent's plan before committing depends on a roll driven by
**coach experience**, a new entity that persists across runs.

---

## Step 1 — Halftime split and possession swap

**Why:** prerequisite for halftime tempo changes, and it fixes a
measured bias.

**The bug.** `simulateGame` (`src/sim/gameSim.ts`) calls
`playPeriod(awaySide, homeSide, REGULATION_SECONDS, rng)` once for all
3600 seconds. The away side therefore receives *every* opening
kickoff and there is no halftime. Measured over 3072 games with each
pairing played both directions (so roster quality cancels):

```
Home win rate:  54.0%      [NFL reference ~55-57%]
Avg drives — home 9.49, away 9.97
```

The away team gets **0.48 extra possessions per game**. Real football
balances this by giving the second-half kickoff to whoever kicked to
open.

**Do:**

1. Split regulation into two halves of `REGULATION_SECONDS / 2`.
2. Second half: the side that kicked off to open now receives, and
   field position resets to `TOUCHBACK_YARDS_TO_GOAL` (75).
3. Keep overtime exactly as-is — it already alternates who receives.
4. `playPeriod` currently carries `yardsToGoal` across the whole game;
   that must reset at the half, not carry over.

**Done when:**
- Home win rate lands in 55–57% on the both-directions test above.
- Home and away average drives are within ~0.1 of each other.
- `npm test` green, `npm run sanity` numbers within noise of §0.2.

---

## Step 2 — Tempo, engine-side only (GO / NO-GO)

**Why:** this is the experiment that decides whether the whole feature
is worth building. Do not build UI before it passes.

**Background measured already.** Forcing fixed pass rates and simming
halves:

| pass rate | drives/half | clock/drive | points/drive |
|---|---|---|---|
| 0.25 | 12.22 | 149s | 4.64 |
| 0.42 | 13.66 | 133s | 4.59 |
| 0.55 | 14.91 | 122s | 4.52 |
| 0.68 | 16.13 | 113s | 4.51 |
| 0.85 | 18.00 | 101s | 4.51 |

A 47% swing in possession count with efficiency roughly flat — the
right shape for a variance dial. Clock costs live in `src/sim/play.ts`:
run 38s, completed pass 33s, incomplete 7s, sack 34s.

**Do:**

1. Add `type Tempo = "fast" | "balanced" | "grind"` and thread an
   optional tempo into `GameSituation` (`src/sim/playCalling.ts`).
2. In `AiPlayCaller.callPlay`, apply tempo as a **modifier on the
   scheme's baseline**, not an absolute:
   `SCHEME_PASS_RATE` is `powerRun 0.42, airRaid 0.68, westCoast 0.6,
   rpo 0.53`. Suggested: fast `+0.15`, grind `−0.15`, balanced `0`.
   Scheme identity must survive — Air Raid on grind should still pass
   more than Power Run on fast.
3. Leave the existing situational logic intact and applied *after*
   tempo. A grind plan that falls behind late should still throw; that
   is correct behaviour, not a bug.
4. Optionally nudge fourth-down aggression by tempo (`callFourthDown`
   already computes expected values; grind leans punt, fast leans go).
5. Let AI teams pick tempo: favourite → fast, underdog → grind, using
   their own unit ratings vs the opponent's.

**Done when — the crossover test:**

Build a favourite (about +10 total unit rating) and an underdog (−10).
Play many seasons at each tempo.

- The favourite must win **more** with fast than with grind.
- The underdog must win **more** with grind than with fast.

**If one tempo wins in both cases, stop and report.** That means tempo
is a button everyone presses, not a decision, and the design needs
rework before anything is built on it. This is the single most
important gate in this spec.

Also confirm `npm run sanity` still holds — changing pass rates moves
yards per play and scoring, so some retuning of `src/sim/play.ts` may
be needed. Record before/after numbers.

---

## Step 3 — Coach entity and the information roll

**Why:** `DESIGN.md` §5.3 declares `coach: Coach` on `Team`. It was
never implemented — there is no coach code in `src/`. This is where
weekly information asymmetry comes from.

**Do:**

1. Add a `Coach` model: id, name, `experience` (number). Attach to
   `Team`; generate AI coaches with a spread of experience in
   `src/generators/teamGenerator.ts`.
2. Implement the weekly **reveal roll** with three outcomes:

   | Outcome | Effect |
   |---|---|
   | You read them | Their plan locks first; you see it and choose in response |
   | Neither | Both commit blind; fog scouting report only |
   | They read you | You commit first; the AI counters your plan |

   Coach experience shifts the *distribution*, not a coin flip. Equal
   experience should land in "neither" most often.
3. **Never 100%.** Curve it hard — roughly 30% → 60% chance of reading
   across an entire career. A guaranteed read solves the game.
4. The reveal shows **schemes only, never tempo** — tempo is
   changeable at halftime (Step 6), so revealing it pre-game would be
   misleading.
5. Losing the roll still yields a fog-based scouting report: opponent
   tendencies and unit ratings as ranges, never exact numbers.

**Done when:**
- A high-experience coach demonstrably reads more often than a
  low-experience one, over many samples.
- Reading the opponent and counter-picking is worth measurable wins
  versus committing blind.
- Sanity numbers unchanged (this step adds information, not balance).

---

## Step 4 — Scheme familiarity and weekly scheme override

**Why:** this is where the feature can fail. Read the risk before
implementing.

**The risk.** Scheme fit is currently worth **3.1 wins/season** because
a roster is built for one scheme. If schemes can be swapped freely each
week, fit stops mattering and the draft degenerates from "take players
who fit my system" into "take best available". That would damage
systems that already work.

**Do:**

1. Add per-team, per-scheme **familiarity** (0–1). The base scheme
   starts at full; running a scheme raises it, neglect decays it.
2. Familiarity scales how much of the fit bonus applies. In
   `computeOverall` (`src/models/player.ts`), scheme currently
   multiplies attribute weights via `schemeWeightFor`
   (`src/schemes.ts`). Blend it:
   `effectiveWeight = baseWeight * (1 + (schemeMultiplier - 1) * familiarity)`
   Familiarity 1 reproduces today's behaviour exactly; familiarity 0
   falls back to neutral weights.
3. Thread a weekly plan into the sim as an **override parameter**, not
   by mutating `team.scheme` — development and AI logic read
   `team.scheme` and assume it is stable across a season.

**Calibration — expect to tune, and it can fail either way.** Fit is
worth ~3 wins; the matchup table (`SCHEME_MATCHUPS` in
`src/schemes.ts`) only swings 0.90–1.08. As it stands, counter-picking
may **never** be worth the fit loss, leaving the feature dead. If so,
widen the matchup multipliers or slow familiarity decay. Report the
numbers rather than silently picking values.

**Done when:**
- Switching to the optimal counter beats never switching by roughly
  0.5–1 win/season.
- Switching **randomly loses** — if random switching is free, the
  familiarity cost is not biting.
- Scheme fit for a single-identity team stays near 3.1 wins. **If it
  drops below ~1.5, stop** — the roster-building loop is damaged and
  familiarity needs to be harsher.

---

## Step 5 — Coach profile persists across runs

**Why:** the roguelike hook. Also fixes dead code: `scoutingTier` on
`FranchiseState` (`src/franchise/runState.ts`) is threaded into draft
generation but **nothing ever increments it**.

**Do:**

1. Split persistence in two:
   - **Coach profile** — survives being fired, its own localStorage
     slot: experience, career record, championships, `scoutingTier`.
   - **Franchise state** — dies with the run: ownership patience,
     reputation, that team's history.
2. Move `scoutingTier` onto the coach profile and let experience buy
   it. It already sharpens draft scouting via `scoutingError` in
   `src/draft/draftClass.ts`; it should also tighten the weekly
   scouting report from Step 3.
3. Save/load lives in `src/franchise/save.ts`. Note the existing
   version-tagged envelope and the sandbox-safe storage probe — keep
   both patterns. Bump `SAVE_VERSION` if the run save shape changes.

**Known adjacent bug, fix while here:** player ids come from a
module-level counter in `src/generators/playerGenerator.ts` that only
resets on New Run. Loading a save into a fresh page and then drafting
mints rookie ids that collide with existing players'. Roster lookups
and draft picks key on those ids. Store the counter in the session.

**Done when:**
- Being fired preserves coach experience into the next run.
- A high-scouting-tier run drafts measurably better than tier 0.
- A save round-trips and continues mid-season without id collisions.

---

## Step 6 — UI

Only after Steps 1–5 pass their gates.

**Do:**

1. **Weekly game plan screen** — the 4×4 offense × defense grid. Each
   cell shows your projected unit ratings in that combination against
   this week's opponent, plus your familiarity in it. Pick a cell, then
   a tempo. Target: under 15 seconds, with sensible defaults (your base
   scheme, balanced) so it never becomes a chore across 17 weeks.
2. **Scouting panel** — what you know about the opponent, visibly
   fogged, and whether you won the read this week.
3. **Halftime prompt** — score and stats so far, tempo change only.
   Schemes are installed for the week and cannot change at halftime;
   keeping the two levers on different cadences is deliberate.
4. **Coach career** on the run-over screen — experience gained, what it
   unlocks next run.

UI conventions: state lives in one mutable `GameSession` plus a
re-render counter; every mutation goes through the single `act()`
helper in `web/src/App.tsx`, which also autosaves. Follow that pattern.
Every screen adds a tab in `App.tsx` — expect small conflicts there.

**Done when:** a full season is playable through the grid, a halftime
prompt appears and changing tempo visibly changes second-half
possession counts, and `npm run ui:build` succeeds.

---

## Open design questions — decide, do not guess silently

1. **Does losing the read mean the AI actively counters you, or merely
   that you cannot see them?** Active counter is more dramatic but
   punishes an inexperienced coach twice. Start with active counter;
   soften if playtesting says it feels unfair.
2. **New run after a firing — full career experience, or a fraction?**
   Full makes later runs strictly easier; a fraction makes each run a
   fresh start with an edge. This sets how much losing stings.
3. **Should tempo be a third axis on the grid, or a separate control?**
   Separate keeps the grid readable; combined shows the full plan at
   once.

## Reporting back

For each step, report: what changed, the before/after `npm run sanity`
numbers, the result of that step's gate test, and any constant you
retuned with the reason. If a gate fails, stop and report rather than
tuning until it passes — a gate that only passes after the target moved
is not a gate.
