# Football Rogue — Game Design Doc

## 1. Vision

A browser-based, Madden-flavored roguelike where you run an NFL-style
franchise one season at a time. Each season is a "run": you build a
roster, pick schemes that counter your opponents', earn points from
performance, and spend them on player growth. The season ends in a
draft where the worst team picks first — same as the real NFL — and
your choices (including whether the run ends in disaster) feed into a
persistent meta-layer across future franchises.

The "rogue" part isn't dungeon crawling — it's run structure:
procedurally generated rosters/draft classes, permanent consequences
(career-ending injuries, being fired), risk/reward play-calling, and
meta-progression that survives a bad season even when your team
doesn't.

## 2. Platform & Stack (MVP)

- Web app, client-rendered. React + TypeScript.
- Simulation engine is pure TS, framework-agnostic, so it can run
  headless (tests, balancing scripts) or in a Node backend later if we
  add multiplayer leagues. For MVP, all state lives client-side
  (localStorage/IndexedDB) — no backend required to play solo.
- No real player names/likenesses — fully original, procedurally
  generated players and teams.

## 3. Core Loop

```
 ┌─> Preseason: review roster, set scheme, spend leftover points
 │        │
 │        v
 │   Regular Season (17 games): play-call each game, earn Franchise
 │   Points from wins/performance, random events fire between games
 │        │
 │        v
 │   Playoffs (top teams) -> Champion crowned
 │        │
 │        v
 │   Offseason:
 │     - Draft (reverse standings order, procedural rookie class)
 │     - Trade window (players + picks, AI-driven counterparties)
 │     - Free agency / re-signing with Franchise Points
 │        │
 │        v
 │   Season-end check: fired / relegated? ──yes──> RUN ENDS
 │        │no                                         │
 └────────┘                                            v
                                          Meta-progression banked,
                                          start a new franchise
```

One playthrough of the above = one season = one "run" in the
roguelike sense. A run can end early (mid-season firing after enough
losses) or naturally after a bad enough postseason review.

## 4. Roguelike Hooks

- **Procedural generation**: every draft class, undrafted free agent
  pool, and opposing coaching staff is generated fresh per run from
  weighted archetypes — no two franchises see the same league.
- **Permadeath, football-flavored**: a career-ending injury removes a
  player permanently (no reload). Enough of those, or enough losses,
  and ownership fires you — the run ends. This is the closest
  analogue to roguelike death.
- **Risk/reward encounters**: play-calling and in-game "gamble"
  options (fake punts, onside kicks, no-huddle) are the moment-to-moment
  risk decisions, same role as combat choices in a dungeon crawler.
- **Meta-progression across runs**: scouting-network tier, coaching
  tree unlocks, and cosmetic franchise history persist after a run
  ends, so a failed season isn't a full reset — same shape as
  roguelike unlocks that survive a death.
- **Escalating difficulty**: the better your all-time franchise
  reputation, the sharper the AI opponents get next run — pressure to
  keep pushing rather than turtle at a comfortable difficulty.

## 5. Entities & Data Model (draft)

```ts
type Position = "QB" | "RB" | "WR" | "TE" | "OL" | "DL" | "LB" | "CB" | "S" | "K" | "P";

interface Player {
  id: string;
  name: string;          // procedurally generated
  position: Position;
  archetypeId: string;    // see §5.2 — drives scheme fit
  age: number;
  general: Record<GeneralAttributeKey, number>;              // §5.1 tier 1
  positional: Partial<Record<PositionalAttributeKey, number>>; // §5.1 tier 2
  skillTree: SkillNode[]; // position-specific, see §6
  potential: number;      // ceiling, hidden/fuzzy to the player (rogue-like fog)
  health: {
    status: "healthy" | "questionable" | "out" | "career-ending";
    injuryHistory: Injury[];
  };
  contract: { yearsLeft: number; capHit: number };
  morale: number;
}
```

Overall is derived from attributes rather than stored, so it can never drift
out of sync with the stats on the card.

### 5.1 Two-tier attributes (Madden-style)

Player stats split into two tiers, which is also exactly how a player card
renders:

- **General** — physical/mental traits *every* player has: Speed (SPD),
  Acceleration (ACC), Agility (AGI), Strength (STR), Awareness (AWR),
  Stamina (STA), Injury Resistance (INJ).
- **Positional** — skill groups that only exist for positions that use
  them, so a cornerback simply *has no* `throwPower` field rather than an
  irrelevant number:

  | Group | Attributes |
  |---|---|
  | Passing | THP, SAC, DAC, TOR, PAC |
  | Ball Carrying | CAR, BTK, ELU, BCV |
  | Receiving | CTH, CIT, RTE, RLS |
  | Blocking | RBK, PBK, IBL |
  | Pass Rush | PMV, FMV, BSH, PUR |
  | Tackling | TAK, POW |
  | Coverage | MCV, ZCV, PRS, PRC |
  | Kicking | KPW, KAC |

Each position declares which groups it owns (`POSITION_GROUPS`) and carries
a **per-attribute baseline** (`POSITION_BASELINES`) — receivers average ~88
speed and linemen ~52, a back's pass blocking tops out far below a tackle's.
Baselines are then normalized per position (`POSITION_BASELINE_OFFSET`) so
an 80-overall QB and an 80-overall CB represent comparable value; without
that, positions whose weights favor naturally-high attributes would
out-rate the rest and skew team ratings.

### 5.2 Archetypes

Within a position, archetypes give players distinct identities: Man Corner
vs. Zone Corner, Road Grader vs. Pass Protector, Power Rusher vs. Speed
Rusher. Modifiers are deliberately trade-offs — every archetype gives up
something — so none is strictly best. What makes one *right* is scheme fit
(§6): a Road Grader is worth more in a Power Run offense than in an Air
Raid, and a Man Corner is wasted in a Cover-2 Zone scheme.

This is the mechanism that makes the scheme counter-web bite at the roster
level rather than being a flat multiplier.

### 5.3 Team & League

```ts
interface Team {
  id: string;
  name: string;
  roster: Player[];
  scheme: { offense: SchemeId; defense: SchemeId };
  capSpace: number;
  draftPicks: DraftPick[];  // future-year picks included, for trades
  franchisePoints: number;  // spendable currency, see §7
  record: { wins: number; losses: number; ties: number };
  coach: Coach;
}

interface League {
  season: number;
  teams: Team[];
  schedule: Game[];
  standings: StandingsRow[];
}
```

## 6. Schemes & Skill Trees

**Schemes** are the strategic layer. Each team picks one offensive and
one defensive scheme; schemes form a soft rock-paper-scissors web
rather than a strict cycle, so counters are directional but not
absolute:

- Offense: *Power Run*, *Air Raid*, *West Coast (short/quick)*, *RPO/Spread*
- Defense: *4-3 Base*, *3-4 Odd*, *Cover-2 Zone*, *Blitz-heavy Man*

Example counter relationships (weights applied to sim outcomes, not
hard blocks):
- Blitz-heavy Man beats West Coast (no time to set up quick reads) but
  is vulnerable to RPO/Spread (misreads at the line).
- Cover-2 Zone smothers Air Raid deep shots but is soft against Power
  Run between the tackles.

### 6.1 Scheme fit — what a scheme asks of its players

Fit and counter are separate mechanisms. The matchup table above is
*counter*: how your scheme fares against theirs. **Fit** is how well
your roster suits the scheme you chose, and it works by changing
**which traits count** rather than by adding a bonus to them.

Each scheme marks attributes as `core` (×2.0 weight), `support`
(×1.4), or `deEmphasis` (×0.5), and a player's rating is recomputed
with those weights. Cover-2 Zone makes zone coverage and play
recognition decide a corner's worth and makes press technique nearly
irrelevant; Blitz-Heavy Man does the exact reverse. Nothing is written
back to the player — switching scheme changes how someone performs,
not who they are.

It has to act on the weights, not the attribute values. A corner's
overall permanently weights man coverage (0.20) above zone (0.16), so
a flat value bonus left a man specialist out-rating a zone specialist
*inside a zone scheme* — the wrong trait kept the heavier weight.
Reweighting fixes it at the source: a 71-overall Man Corner drops to
64 in Cover-2 while a 61-overall Zone Corner rises to 63.

This is what makes archetypes (§5.2) matter and what makes roster
construction a real decision — building a whole roster for its schemes
rather than against them is currently worth ~1.6 wins per season,
tracked by `npm run sanity` so it can't silently regress to zero.

### 6.2 Skill trees

Every position has a three-tier tree. Each tier offers mutually
exclusive choices and you take one per tier, in order, so players
specialize rather than eventually collecting everything — a receiver
becomes a Route Technician *or* a Deep Threat, and which is right
depends on the scheme he plays in.

Nodes add flat bonuses to the attributes the sim already reads, so a
spent point flows straight through unit ratings into the play engine
and onto the scoreboard. Bonuses are stored precomputed on the player
and applied by `getAttribute`, which means no other system has to know
skill trees exist. Costs are 80 / 200 / 380.

Development is worth about **1.75 wins a season** over leaving the
points unspent — tracked by `npm run sanity`.

## 7. Economy: Franchise Points

### 7.1 Earning development, and why it is EPA

A drive is worth the expected points the offense gained minus what the
defense took away. That netting is what pays for development: each unit
is scored against what an average unit produces, and the score is routed
to the players who actually filled it.

Using expected points rather than yardage matters most on defense,
which generates no counting statistics of its own. A defense earns from
the EPA it **denied**, which is exactly the negative of what the
opposing offense gained — so holding a good offense to +2 instead of +7
is worth real development even with an empty stat line. Verified in the
sim: defensive EPA is precisely the negative of the opponent's
offensive EPA on every game, and net EPA alone picks the winner of 96%
of games (correlation with point margin 0.98).

Contribution is shared by role, compressed by a square root so a
quarterback develops fastest without leaving five linemen splitting one
group's weight stuck at zero. Healthy players who never crack the depth
chart still earn a small amount, so a roster can grow its own
replacements.

### 7.2 Two pools

Two point pools, deliberately separate:

- **Team Franchise Points**: earned from wins, playoff runs, and
  team-level milestones. Spent on facilities, scouting tier, coaching
  upgrades, and free-agent signings.
- **Player Development Points**: earned per-player from their own
  stat lines/big plays. Spent only on that player's skill tree — this
  is what makes star players feel earned rather than bought.

Both pools reset in scale (not to zero) between seasons, similar to a
roguelike's gold-to-permanent-upgrade conversion at a floor boundary.

## 8. Draft & Trades

- **Draft order**: strictly reverse full-season standings (worst
  record picks first), mirroring the real NFL. Ties broken by
  strength of schedule.
- **Draft class**: procedurally generated each run — position mix,
  bust/boom variance on `potential`, and a scouting fog-of-war (true
  attributes are hidden behind a scouted range until Scouting tier is
  upgraded via meta-progression).
- **Trades**: any combination of players + current/future picks.
  AI teams evaluate offers using a value model (Jimmy Johnson-style
  pick chart + player overall/age/scheme-fit), and will occasionally
  propose trades to the player unprompted, especially right before
  the draft.

## 9. Random Events

Between-game events add roguelike unpredictability without full-on
game-loss randomness:
- Locker-room chemistry swings (morale-based buffs/debuffs)
- Weather games (favor Power Run / hurt Air Raid)
- Bye-week scouting opportunities (peek at an upcoming draft prospect)
- Injury variance beyond the direct in-game sim

## 10. Simulation Engine

A win is the sum of value produced per drive, exactly as it sounds: play
possessions until the clock runs out, add up the points, higher total
wins. What makes that meaningful is how each drive resolves.

### 10.1 Unit ratings

Rather than one offense number against one defense number, the sim
computes four ratings from the attributes that actually do each job, on
the players who actually do it:

| Unit | Built from |
|---|---|
| Pass offense | QB accuracy/power/awareness, WR route running & hands, OL pass block, TE |
| Rush offense | OL run block, RB break tackle/vision, TE blocking, QB legs |
| Pass defense | CB/S coverage, DL pass rush, LB coverage |
| Rush defense | DL block shedding & strength, LB tackling & pursuit, S tackling |

Players are ranked *for the job in question*, so the passing game uses
the best receivers by receiving ability rather than by overall rating.
Scheme emphasis (§6.1) applies here too.

This is what lets the sim tell *how* a team is good, not just how much.
An elite quarterback lifts every pass play; an elite tight end moves a
slice of two units. Before this existed, an elite QB was worth the same
as an elite corner, and kickers were worth literally nothing.

### 10.2 Drive resolution

Each possession runs downs and distance from a real field position:

- Play type comes from the play caller (§10.3).
- **Pass** resolves sack → interception → completion → yards, with
  right-skewed gains so most plays are short and a few are explosive.
- **Run** resolves fumble → yards.
- Reaching the end zone scores 6 plus an extra-point attempt; a fourth
  down becomes a field goal, a punt, or a snap.
- **Field position carries across possessions.** A turnover hands the
  opponent the ball where it happened, which is what makes a turnover
  cost something rather than being a slower punt.
- Kickers and punters have real jobs: `kickPower` sets field-goal range,
  `kickAccuracy` sets make probability, and punt distance decides the
  field the defense inherits.

### 10.3 Play calling

Scheme sets a baseline pass rate (Air Raid 68%, Power Run 42%), and
situation moves it — trailing late throws, leading late runs, short
yardage runs. Fourth downs weigh field-goal range against distance and
game state.

`PlayCaller` is an interface. The AI implementation drives every team
today; a human-controlled team drops in without touching the drive
engine.

### 10.4 Emergent consequences

Because drives consume real clock, possession counts are *not* fixed —
they emerge from how teams play. A run-heavy offense bleeds clock and
shortens the game for both sides, so Power Run gains a genuine identity
beyond a lookup-table modifier.

### 10.5 Calibration

`npm run sanity` checks the sim against real NFL rates, and
`npm run value` checks that positional value has the right shape.
Current output:

| Measure | Sim | NFL |
|---|---|---|
| Points per team per game | 22.5 | ~22 |
| Total yards | 350 | ~345 |
| Plays | 59 | ~63 |
| Sacks allowed | 2.4 | ~2.3 |
| Tie rate | 0.2% | ~0.4% |
| Corr(roster rating, wins) | 0.69 | ~0.6–0.7 |
| Most valuable position | QB, 2.4x the next | QB, clearly first |
| Scheme fit worth | 3.1 wins/season | — |
| Development worth | 1.75 wins/season | — |

## 11. MVP Roadmap

1. ~~**Sim core**: headless engine — models, game simulator, scheduler,
   standings.~~ **Done.**
2. ~~**Matchup-driven simulation**: unit ratings, play-by-play drives,
   field position, kicking, play calling (§10).~~ **Done.**
3. ~~**Schemes**: counter matrix plus scheme fit via rating
   reweighting (§6).~~ **Done.**
4. ~~**Skill trees**: spendable development points that move the
   attributes the sim already reads, earned from expected points
   added (§6.2, §7.1).~~ **Done.**
5. **Draft & trades**: offseason phase, procedural draft class
   generator, AI trade logic.
6. ~~**Playable UI**: React front end (`web/`, `npm run ui`) — team
   select, week-by-week season with standings and injuries, roster
   with player cards and skill spending, draft room, ownership
   review, run-over screen, autosave to localStorage.~~ **Done**
   (play calling during games still sim-controlled — a later layer).
7. **Roguelike meta layer**: permadeath injuries, firing/run-end
   conditions, cross-run meta-progression and difficulty scaling.

Each phase should be playable end-to-end before moving to the next.
The UI sits late deliberately: it is cheaper to validate that decisions
change outcomes with a measurement script than to rebuild a front end
every time the systems underneath it move.
