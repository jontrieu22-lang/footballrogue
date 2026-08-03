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

**Skill trees** are per-position, unlocked with Franchise Points
earned from that player's in-game performance (a QB who throws for
300 yards earns his own points toward his tree, separate from the
team pool). Trees are shallow but branching — 3–4 tiers, with each
tier offering 2–3 mutually exclusive nodes so players specialize
(e.g., a WR chooses between a "Route Technician" branch (better vs.
zone) and a "Deep Threat" branch (better vs. man)), which is what
lets individual players counter specific opposing schemes.

## 7. Economy: Franchise Points

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

## 10. MVP Roadmap

1. **Sim core**: headless TS engine — Player/Team/League models, a
   deterministic-but-seedable game simulator (drive-by-drive, not
   snap-by-snap yet), season scheduler, standings.
2. **Playable loop**: minimal React UI — roster view, simple
   play-calling during games (choose a play archetype each drive),
   season progression, box scores.
3. **Skill trees & schemes**: attribute-driven sim outcomes, scheme
   counter matrix, spendable Player/Team points.
4. **Draft & trades**: offseason phase, procedural draft class
   generator, AI trade logic.
5. **Roguelike meta layer**: permadeath injuries, firing/run-end
   conditions, cross-run meta-progression and difficulty scaling.

Each phase should be playable end-to-end before moving to the next —
phase 1+2 alone is already a "simulate a season" toy; phase 5 is what
turns it into the pitched game.
