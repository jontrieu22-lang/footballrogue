import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { getSchemeMultiplier } from "../schemes.js";
import { simulateDrive, type DriveResult } from "./drive.js";
import { getKicker, getPunter, type Kicker } from "./kicking.js";
import { AiPlayCaller, type PlayCaller } from "./playCalling.js";
import { computeTeamUnits, type TeamUnitRatings } from "./units.js";

const REGULATION_SECONDS = 3600;
const OVERTIME_SECONDS = 600;
const MAX_OVERTIME_PERIODS = 3;
const TOUCHBACK_YARDS_TO_GOAL = 75;

/**
 * Home advantage, applied to the home offense's unit ratings. Small, because
 * the drive engine compounds it across every play of the game.
 */
const HOME_FIELD_BONUS = 1.5;

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

function buildSide(team: Team, opponent: Team, isHome: boolean): SideState {
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

export function simulateGame(home: Team, away: Team, rng: SeededRng): GameResult {
  const homeSide = buildSide(home, away, true);
  const awaySide = buildSide(away, home, false);

  playPeriod(awaySide, homeSide, REGULATION_SECONDS, rng);

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
