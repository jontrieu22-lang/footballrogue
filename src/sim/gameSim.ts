import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { getSchemeMultiplier } from "../schemes.js";
import type { Tempo } from "../types.js";
import { simulateDrive, type DriveResult } from "./drive.js";
import { getKicker, getPunter, type Kicker } from "./kicking.js";
import { AiPlayCaller, type PlayCaller } from "./playCalling.js";
import { computeTeamUnits, type TeamUnitRatings } from "./units.js";

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
 */
function applyMatchup(units: TeamUnitRatings, multiplier: number): TeamUnitRatings {
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
  tempo: Tempo;
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

function buildSide(team: Team, opponent: Team, isHome: boolean, tempo: Tempo): SideState {
  const base = computeTeamUnits(team);
  const withHome = isHome ? applyHomeBonus(base) : base;
  const matchup = getSchemeMultiplier(team.scheme.offense, opponent.scheme.defense);

  return {
    team,
    units: applyMatchup(withHome, matchup),
    stats: emptyStats(),
    kicker: getKicker(team.roster),
    punter: getPunter(team.roster),
    playCaller: new AiPlayCaller(),
    tempo,
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
        scheme: offense.team.scheme.offense,
        playCaller: offense.playCaller,
        kicker: offense.kicker,
        punter: offense.punter,
        startingYardsToGoal: yardsToGoal,
        scoreDifferential: offense.stats.points - defense.stats.points,
        secondsRemaining,
        tempo: offense.tempo,
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

/**
 * Per-game tempo overrides. Omitted sides use the AI's own pick (favourite
 * fast, underdog grind). The human team's weekly plan will fill these in
 * once the game plan UI lands.
 */
export interface GameTempoOverrides {
  homeTempo?: Tempo;
  awayTempo?: Tempo;
}

export function simulateGame(
  home: Team,
  away: Team,
  rng: SeededRng,
  tempos: GameTempoOverrides = {},
): GameResult {
  const homeSide = buildSide(home, away, true, tempos.homeTempo ?? aiTempo(home, away, true));
  const awaySide = buildSide(away, home, false, tempos.awayTempo ?? aiTempo(away, home, false));

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
