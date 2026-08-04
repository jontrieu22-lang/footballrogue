# Spec: Trading system — players, picks, and a market that cannot be fleeced

Handoff spec for an agent with no prior context on this repo. Read §0
before touching anything. **Step 1 is a prerequisite — the trade
system does not work until it is done.**

---

## 0. What you need to know first

### 0.1 The project

`footballrogue` is a football-management roguelike. A pure-TypeScript
simulation engine lives in `src/`; a React front end in `web/` calls it
directly. No backend, no network. Work happens on branch
`claude/football-roguelike-game-1qn3mi`.

```
npm run typecheck    # tsc --noEmit
npm test             # vitest, 112 tests
npm run sanity       # balance measurements vs real NFL rates
npm run value        # wins added per elite starter, by position
npm run ui           # dev server for the web app
```

### 0.2 How this codebase decides whether something works

Passing tests is not the bar. The bar is a set of **global balance
numbers** printed by `npm run sanity`:

| Measure | Current | Reference |
|---|---|---|
| Points per team per game | 21.8 | ~22 (NFL) |
| Corr(roster rating, wins) | 0.700 | 0.6–0.7 |
| Scheme fit worth | 3.10 wins/season | — |
| Development worth | 1.75 wins/season | — |

Run `npm run sanity` before and after every step and record both.

### 0.3 HAZARD: semantic conflicts

Twelve files hold hand-tuned balance constants. A change can be locally
correct, pass all 112 tests, merge cleanly, and still degrade the game,
because these numbers are only meaningful relative to each other.

This work is mostly **additive** (new `src/trade/`), which is why it can
run parallel to other streams. The exceptions are Step 1 (touches
`progression/development.ts`) and Step 2 (touches
`franchise/runState.ts`). Do not also retune `src/sim/*`.

### 0.4 Measurement style

Claims about behaviour are backed by throwaway scripts that measure
them, not by reasoning. Write them to a scratch directory outside the
repo, run with `npx tsx <file>`. Always call `resetPlayerIdCounter()`
and `resetTeamIdCounter()` from `src/generators/*` before generating,
or ids collide.

### 0.5 Existing machinery you will reuse — read these first

| Thing | Where | Why it matters |
|---|---|---|
| `DraftPick { season, round, originalTeamId }` | `src/models/team.ts` | Declared on `Team`, **never populated**. Step 2 fills it. |
| `computeTeamUnits(team)` | `src/sim/units.ts` | Four unit ratings. The core of valuation (§3). |
| `computeOverall(player, scheme?)` | `src/models/player.ts` | Scheme-adjusted player rating. |
| `prospectValueFor(team, prospect)` | `src/draft/draft.ts` | Existing need + value + scheme-fit logic. Good reference. |
| roster minimums | `src/franchise/runState.ts` (`trimRoster`) | Reuse so an AI never trades away its only kicker. |
| positional win values | `npm run value` | Empirically measured, see §2. |

---

## Step 1 — Make `player.potential` real (PREREQUISITE)

**Nothing else in this spec works until this is done.**

**The problem.** `player.potential` is consumed by *nothing*. Not
development, not growth, nowhere in `src/`, and not in the UI. Verify:

```
grep -rn "\.potential" src/ --include=*.ts | grep -v scoutedPotential
```

Development comes entirely from skill trees
(`src/progression/skills.ts`), which are position-based and identical
for every player. **A prospect with potential 92 and one with potential
46 develop identically.** The draft board in
`web/src/DraftScreen.tsx` shows a "Ceiling" column that means nothing.

It is also incoherent with itself. Measured over 40 drafts:

```
pick   1   true OVR 84.8   potential 92.0    <- ceiling above current
pick  32   true OVR 72.4   potential 73.8    <- roughly equal
pick 160   true OVR 57.3   potential 46.0    <- ceiling BELOW current
```

Potential and overall are generated semi-independently
(`src/generators/playerGenerator.ts`) and never reconciled.

**Why trading needs it.** "Young player with upside" is one of the
fundamental trade archetypes. More importantly, §2 explains that a
market only exists because contenders and rebuilders value the *same
asset differently* — and that asymmetry needs a time axis. Without real
potential, every trade is zero-sum on current ability and there is
little reason for either side to make one.

**Do:**

1. Make potential a genuine ceiling. Recommended: it **caps** how far a
   player develops — e.g. gate skill-tree tiers, or stop granting
   development points once `computeOverall` approaches potential.
   Capping is preferred over merely slowing growth because "high
   ceiling" then reads legibly to the player.
2. Reconcile generation so potential is never below a player's starting
   overall. Generate overall first, then potential as overall plus a
   non-negative, age-sensitive margin.
3. Young players should have room; players past the decline age
   (`DECLINE_AGE = 29` in `runState.ts`) should have little or none.

**Done when:**
- Two players of equal current overall but different potential diverge
  measurably in overall after ~3 simulated seasons of development.
- No generated player has potential below current overall.
- `npm run sanity` numbers hold, in particular development worth
  (~1.75 wins) — capping development will move this, so **record the
  new value and report it** rather than forcing the old number.

---

## Step 2 — Populate draft picks as tradeable assets

**Do:**

1. At season rollover (`advanceOffseason` in
   `src/franchise/runState.ts`), give every team its own picks for the
   next **3** seasons, rounds 1..`DRAFT_ROUNDS` (currently 5, in
   `src/draft/draft.ts`).
2. Consume the matching pick when a selection is made, so ownership and
   the board stay in sync.
3. `startDraft` currently derives order purely from
   `computeDraftOrder`. It must instead honour **who owns each pick**,
   since traded picks change hands. Slot order still comes from reverse
   standings; the team on the clock comes from pick ownership.
4. `originalTeamId` already exists on `DraftPick` — keep it accurate so
   the UI can say "R2 pick, via Ironport".

**Done when:**
- Every team starts a season owning exactly `3 × DRAFT_ROUNDS` picks.
- A draft where no trades occurred produces an identical result to
  today's (regression check against existing tests).
- Save/load round-trips picks.

---

## Step 3 — Valuation in wins, measured not invented

**Do not import the Jimmy Johnson pick chart.** This engine can measure
its own curve, and that is the discipline used everywhere else here.

### 3.1 Pick value

Already measured, 40 drafts × 5 rounds × 32 teams:

| pick | round | true OVR | potential |
|---|---|---|---|
| 1 | R1 | 84.8 | 92.0 |
| 4 | R1 | 80.2 | 83.8 |
| 16 | R1 | 77.1 | 78.5 |
| 32 | R1 | 72.4 | 73.8 |
| 64 | R2 | 67.9 | 62.3 |
| 96 | R3 | 63.6 | 57.8 |
| 128 | R4 | 59.5 | 51.0 |
| 160 | R5 | 57.3 | 46.0 |

Round 1 mean 76.6 OVR vs Round 5 mean 58.0 — an 18.6 point drop, steep
early then flattening. Regenerate this curve as a permanent script
(`scripts/pickCurve.ts`) so it can be refreshed when generation
changes, and bake the output into `src/trade/pickValue.ts`.

Note high picks buy **ceiling** disproportionately (pick 1: 92
potential vs 84.8 current; pick 160: 46 vs 57.3). That is the engine of
§3.3.

### 3.2 Player value

`npm run value` already measures wins added per elite starter by
position:

```
QB +2.60   K +1.07   CB +0.86   S +0.83   TE +0.77   RB +0.73
DL +0.70   P +0.63   WR +0.43   LB +0.42   OL +0.34
```

Use these as positional coefficients rather than inventing weights.
Combine with: margin over a replacement-level player at that position,
years of useful career remaining (age vs `DECLINE_AGE`), and
scheme fit (`computeOverall(p, scheme) − computeOverall(p)`).

### 3.3 Why a market exists at all — do not skip this

If both sides value assets identically, every trade is zero-sum and a
rational AI should never accept one. Markets exist because **contenders
and rebuilders discount the future differently.**

Give each AI team a posture derived from its unit ratings, record and
ownership patience:

- **Contender** — discounts future picks hard, pays a premium for
  current overall.
- **Rebuilder** — values picks and potential at a premium, sells
  veterans.

Same asset, two prices, both sides gain. **If you implement one global
valuation, the market is dead** and gate 2 in §6 will fail.

---

## Step 4 — Trade evaluation, and the structural anti-fleece

### 4.1 The key design decision

Most trade systems value a package by **summing** the values of its
parts. That is how you end up trading five 70-overall backups for one
90-overall star, because the arithmetic says yes.

**Instead: value a trade by the change in unit ratings.** Build the
hypothetical post-trade roster, run `computeTeamUnits` on it, and
weight the four deltas by the §3.2 coefficients. That is the trade's
worth, in wins, to that team.

This kills three exploits with no special-case code:

| Exploit | Why it dies |
|---|---|
| Quantity dumping | Five backups never crack the depth chart, so unit ratings barely move — the package is worth ~nothing automatically |
| Depth stacking | A fourth quarterback never enters a unit calculation, so he is worth zero |
| Ignoring positional need | A thin position gains more from an addition, with no hand-written need logic |

Scheme-fit arbitrage — buying players who fit your scheme but not the
seller's — must stay **legal**. That is the market working, and it
rewards understanding the system.

### 4.2 Acceptance rules

An AI accepts when the package gains value **by its own posture-adjusted
valuation**, plus a margin. Three guards:

1. **Never below minimum depth.** Reuse the position minimums in
   `trimRoster` (`src/franchise/runState.ts`).
2. **Roster limit respected.** `ROSTER_LIMIT` is 53; a trade that
   overflows must force corresponding cuts or be rejected.
3. **Small per-team valuation noise.** A perfectly rational AI means
   the player can never find a good deal, which is boring. Noise lets a
   sharp player find genuine edges — that is the skill reward — while
   the surplus margin prevents systematic exploitation.

Return a structured verdict (`accept` / `counter` / `reject`) with a
reason, so the UI can explain *why* — "we will not go below three
corners" is far better feedback than a silent no.

---

## Step 5 — Windows, AI-initiated offers, and UI

**Windows:**
- **Offseason, pre-draft** — the main window; picks are the currency.
- **Draft day** — trade up and down while on the clock. The steep early
  pick curve (§3.1) makes this immediately meaningful. Hook into
  `runDraftUntil` / `teamOnTheClock` in `src/draft/draft.ts`.
- **In-season deadline** (~week 9) — contenders buy, sellers dump.
  Standings are available via `standings(session)`.

**AI-initiated offers.** The week before the draft and at the deadline,
contenders should come shopping for your stars. Without this the player
never discovers the market exists. Surface them as a decision, not a
notification.

**UI.** Follow the existing pattern in `web/`: state is one mutable
`GameSession` plus a re-render counter, and every mutation goes through
the single `act()` helper in `web/src/App.tsx` which also autosaves.
Add a trade screen (build a package from both sides, see the verdict
live) and a "trade this pick" affordance on the draft board. Each new
screen adds a tab in `App.tsx` — expect small conflicts there.

---

## 6. Gates — stop and report if one fails

1. **The fleecing test (the one that matters).** Generate thousands of
   randomised lopsided offers against AI teams and assert **zero**
   clearly-losing packages are accepted. Make this a permanent test and
   run it in CI. Include the specific quantity-dumping case: N backups
   for one star must always be rejected.
2. **Mutually beneficial trades exist.** For a contender/rebuilder
   pair, there must exist packages both sides' valuations score
   positive. If none exist, the postures in §3.3 are not differentiated
   and the market is dead.
3. **Trading well is worth wins.** A contender that buys at the
   deadline beats an identical contender that stands pat, measurably
   across many seasons.
4. **Nothing already working regressed.** `npm run sanity` holds:
   scheme fit ~3.1, correlation ~0.70, points ~21.8. Development worth
   will have shifted in Step 1 — use the value recorded there.

**Do not tune until a gate passes.** A gate that only passes after the
target moved is not a gate. Report the failure instead.

---

## 7. Open decisions — decide explicitly, do not guess silently

1. **Does potential cap development, or merely slow it?** Recommended:
   cap. A wall is legible; slower growth is muddy.
2. **How far out can future picks be traded?** Three years enables the
   mortgage-the-future play — a great roguelike decision and a classic
   way to lose a run. It also needs a guard so an AI cannot be talked
   into stripping itself bare.
3. **Can the player trade during the playoffs?** Real leagues say no.
   Simpler to forbid it.

## Reporting back

Per step: what changed, before/after `npm run sanity` numbers, the
result of that step's gate, and any constant you tuned with the reason.
Flag anything you found that contradicts this spec — it was written
against the repo at commit `f5b7187` and the codebase may have moved.
