import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { getSchemeMultiplier } from "../schemes.js";
import type { DefenseSchemeId, OffenseSchemeId, Tempo } from "../types.js";
import { simulateDrive, type DriveResult } from "./drive.js";
import { getKicker, getPunter, type Kicker } from "./kicking.js";
import { AiPlayCaller, type PlayCaller } from "./playCalling.js";
import { computeTeamUnits, computeTeamUnitsFor, type TeamUnitRatings } from "./units.js";

const REGULATION_SECONDS = 3600;
/** Regulation is played as two halves; the clock and field position reset between them. */
const HALF_SECONDS = REGULATION_SECONDS / 2;
const OVERTIME_SECONDS = 600;
const MAX_OVERTIME_PERIODS = 3;
const TOUCHBACK_YARDS_TO_GOAL = 75;

/**
 * Home advantage, applied to the home offense's unit ratings. Small, because
 * the drive engine compounds it across every play of the game.
 */
const HOME_FIELD_BONUS = 1.5;

/**
 * How much better (in total unit rating) a team must be to play fast against
 * an opponent, or worse to grind. Mirrors the ±10 build used to test the
 * tempo crossover: only clear favourites and underdogs bother.
 */
const AI_TEMPO_EDGE = 14;

export interface TeamGameStats {
  points: number;
  touchdowns: number;
  fieldGoals: number;
  turnovers: number;
  drives: number;
  playsRun: number;
  passYards: number;
  rushYards: number;
  sacksAllowed: number;
  timeOfPossession: number;
  /** Expected points added by this team's own offense, split by unit. */
  passEpa: number;
  rushEpa: number;
  kickEpa: number;
  /** Expected points this team's defense denied — the negative of what the opponent gained. */
  passDefenseEpa: number;
  rushDefenseEpa: number;
}

export interface GameResult {
  homeTeamId: string;
  awayTeamId: string;
  home: TeamGameStats;
  away: TeamGameStats;
  /** 0 for a game decided in regulation. */
  overtimePeriods: number;
}

function emptyStats(): TeamGameStats {
  return {
    points: 0,
    touchdowns: 0,
    fieldGoals: 0,
    turnovers: 0,
    drives: 0,
    playsRun: 0,
    passYards: 0,
    rushYards: 0,
    sacksAllowed: 0,
    timeOfPossession: 0,
    passEpa: 0,
    rushEpa: 0,
    kickEpa: 0,
    passDefenseEpa: 0,
    rushDefenseEpa: 0,
  };
}

function applyHomeBonus(units: TeamUnitRatings): TeamUnitRatings {
  return {
    passOffense: units.passOffense + HOME_FIELD_BONUS,
    rushOffense: units.rushOffense + HOME_FIELD_BONUS,
    passDefense: units.passDefense + HOME_FIELD_BONUS,
    rushDefense: units.rushDefense + HOME_FIELD_BONUS,
  };
}

/**
 * The scheme matchup table (how your scheme counters theirs) scales the
 * offense's unit ratings. Scheme *fit* is already baked into the unit ratings
 * themselves — see DESIGN.md §6.1.
 *
 * Familiarity dampens the matchup through the side that executes it — the
 * offense. The multiplier is an offense-side concept (it scales the offense's
 * units), so how much of the table's edge applies is gated by the offense's
 * fluency in its own scheme: a half-learned offense can't fully exploit a
 * favourable matchup (raw > 1) and, being less committed to the scheme's
 * tell-tale concepts, is also less hurt by an unfavourable one (raw < 1). An
 * unpracticed scheme plays vanilla — the matchup table has no effect on it at
 * all. Defensive fluency shows up through the fit already baked into the
 * defensive unit ratings.
 */
export function applyMatchup(
  units: TeamUnitRatings,
  rawMultiplier: number,
  offenseFamiliarity: number,
): TeamUnitRatings {
  const multiplier = 1 + (rawMultiplier - 1) * offenseFamiliarity;
  return {
    ...units,
    passOffense: units.passOffense * multiplier,
    rushOffense: units.rushOffense * multiplier,
  };
}

interface SideState {
  team: Team;
  units: TeamUnitRatings;
  stats: TeamGameStats;
  kicker: Kicker;
  punter: Kicker;
  playCaller: PlayCaller;
  /** What this team actually plays this game: season scheme unless overridden weekly. */
  plan: GamePlan;
}

function recordDrive(side: SideState, opponent: SideState, drive: DriveResult): void {
  side.stats.drives += 1;
  side.stats.playsRun += drive.playsRun;
  side.stats.timeOfPossession += drive.clockSeconds;

  // The offense banks what it gained; the defense is credited the negative,
  // so the two sides of every play net out exactly.
  side.stats.passEpa += drive.passEpa;
  side.stats.rushEpa += drive.rushEpa;
  side.stats.kickEpa += drive.kickEpa;
  opponent.stats.passDefenseEpa -= drive.passEpa;
  opponent.stats.rushDefenseEpa -= drive.rushEpa;

  for (const play of drive.plays) {
    if (play.sacked) {
      side.stats.sacksAllowed += 1;
      side.stats.passYards += play.yards;
    } else if (play.type === "pass") {
      side.stats.passYards += play.yards;
    } else {
      side.stats.rushYards += play.yards;
    }
  }

  if (drive.outcome === "touchdown") side.stats.touchdowns += 1;
  if (drive.outcome === "fieldGoal") side.stats.fieldGoals += 1;
  if (drive.outcome === "turnover") side.stats.turnovers += 1;

  if (drive.points >= 0) {
    side.stats.points += drive.points;
  } else {
    // A safety scores for the defense.
    opponent.stats.points += -drive.points;
  }
}

/**
 * The AI's tempo preference: favourites want more possessions so their edge
 * compounds, underdogs want fewer so one lucky break decides the game.
 * Compared on total unit rating (home gets the field bonus it actually plays
 * with), so a team that is a favourite at home can still grind on the road.
 */
function aiTempo(team: Team, opponent: Team, isHome: boolean): Tempo {
  const self = computeTeamUnits(team);
  const other = computeTeamUnits(opponent);
  const selfTotal =
    self.passOffense +
    self.rushOffense +
    self.passDefense +
    self.rushDefense +
    (isHome ? 4 * HOME_FIELD_BONUS : 0);
  const otherTotal =
    other.passOffense + other.rushOffense + other.passDefense + other.rushDefense;
  const difference = selfTotal - otherTotal;
  if (difference >= AI_TEMPO_EDGE) return "fast";
  if (difference <= -AI_TEMPO_EDGE) return "grind";
  return "balanced";
}

/**
 * A team's plan for one game: the schemes it actually runs and the tempo it
 * plays. Defaults to the season scheme pair plus the AI's tempo pick; the
 * weekly game plan (Step 6) overrides it without mutating `team.scheme`,
 * which development and AI logic read and assume is stable across a season.
 */
export interface GamePlan {
  offense: OffenseSchemeId;
  defense: DefenseSchemeId;
  tempo: Tempo;
}

/**
 * Per-game plan overrides. Missing fields fall back to the season scheme
 * and the AI's tempo pick.
 */
export interface GamePlanOverrides {
  home?: Partial<GamePlan>;
  away?: Partial<GamePlan>;
}

function resolvePlan(
  team: Team,
  partial: Partial<GamePlan> | undefined,
  tempoPick: Tempo,
): GamePlan {
  return {
    offense: partial?.offense ?? team.scheme.offense,
    defense: partial?.defense ?? team.scheme.defense,
    tempo: partial?.tempo ?? tempoPick,
  };
}

function buildSide(
  team: Team,
  isHome: boolean,
  plan: GamePlan,
  opponentDefense: DefenseSchemeId,
): SideState {
  // Units are rated in the scheme the team actually plays, so a roster built
  // for its season scheme loses fit when a weekly plan switches schemes.
  const base = computeTeamUnitsFor(team, plan.offense, plan.defense);
  const withHome = isHome ? applyHomeBonus(base) : base;
  const rawMatchup = getSchemeMultiplier(plan.offense, opponentDefense);

  return {
    team,
    units: applyMatchup(withHome, rawMatchup, team.familiarity[plan.offense]),
    stats: emptyStats(),
    kicker: getKicker(team.roster),
    punter: getPunter(team.roster),
    playCaller: new AiPlayCaller(),
    plan,
  };
}

/**
 * Plays possessions alternately until the clock runs out. Because drives take
 * variable real time, possession counts emerge from how the teams play — a
 * run-heavy offense bleeds clock and shortens the game for both sides.
 */
function playPeriod(
  first: SideState,
  second: SideState,
  totalSeconds: number,
  rng: SeededRng,
): void {
  let secondsRemaining = totalSeconds;
  let offense = first;
  let defense = second;
  let yardsToGoal = TOUCHBACK_YARDS_TO_GOAL;

  while (secondsRemaining > 0) {
    const drive = simulateDrive(
      {
        offense: offense.units,
        defense: defense.units,
        scheme: offense.plan.offense,
        playCaller: offense.playCaller,
        kicker: offense.kicker,
        punter: offense.punter,
        startingYardsToGoal: yardsToGoal,
        scoreDifferential: offense.stats.points - defense.stats.points,
        secondsRemaining,
        tempo: offense.plan.tempo,
      },
      rng,
    );

    recordDrive(offense, defense, drive);
    secondsRemaining -= Math.max(drive.clockSeconds, 1);
    yardsToGoal = drive.nextFieldPosition;

    const nextOffense = defense;
    defense = offense;
    offense = nextOffense;
  }
}

export function simulateGame(
  home: Team,
  away: Team,
  rng: SeededRng,
  overrides: GamePlanOverrides = {},
): GameResult {
  const homePlan = resolvePlan(home, overrides.home, aiTempo(home, away, true));
  const awayPlan = resolvePlan(away, overrides.away, aiTempo(away, home, false));
  const homeSide = buildSide(home, true, homePlan, awayPlan.defense);
  const awaySide = buildSide(away, false, awayPlan, homePlan.defense);

  // First half: the away team receives the opening kickoff, so the home
  // team kicked off to open.
  playPeriod(awaySide, homeSide, HALF_SECONDS, rng);
  // Second half: real football gives the second-half kickoff to the side
  // that kicked off to open, so the home team receives and field position
  // resets. Without this split, the away team received every kickoff and
  // gained ~0.5 extra possessions per game.
  playPeriod(homeSide, awaySide, HALF_SECONDS, rng);

  let overtimePeriods = 0;
  while (homeSide.stats.points === awaySide.stats.points && overtimePeriods < MAX_OVERTIME_PERIODS) {
    // Alternate who receives first each period.
    const receiving = overtimePeriods % 2 === 0 ? homeSide : awaySide;
    const kicking = receiving === homeSide ? awaySide : homeSide;
    playPeriod(receiving, kicking, OVERTIME_SECONDS, rng);
    overtimePeriods++;
  }

  return {
    homeTeamId: home.id,
    awayTeamId: away.id,
    home: homeSide.stats,
    away: awaySide.stats,
    overtimePeriods,
  };
}
