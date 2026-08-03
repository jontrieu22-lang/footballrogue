import { computeDefenseRating, computeOffenseRating, type Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { getSchemeMultiplier } from "../schemes.js";

const POSSESSIONS_PER_TEAM = 12;
const HOME_FIELD_BONUS = 2;

export interface TeamGameStats {
  points: number;
  touchdowns: number;
  fieldGoals: number;
  turnovers: number;
  drives: number;
}

export interface GameResult {
  homeTeamId: string;
  awayTeamId: string;
  home: TeamGameStats;
  away: TeamGameStats;
}

interface DriveOutcome {
  points: 0 | 3 | 7;
  turnover: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function simulateDrive(offenseRating: number, defenseRating: number, rng: SeededRng): DriveOutcome {
  const ratingDiff = offenseRating - defenseRating;
  const scoreProb = clamp(0.42 + ratingDiff / 150, 0.15, 0.75);

  if (rng.chance(scoreProb)) {
    const touchdownShare = clamp(0.58 + ratingDiff / 300, 0.35, 0.8);
    return { points: rng.chance(touchdownShare) ? 7 : 3, turnover: false };
  }

  const turnoverProb = clamp(0.18 - ratingDiff / 300, 0.06, 0.3);
  return { points: 0, turnover: rng.chance(turnoverProb) };
}

function emptyStats(): TeamGameStats {
  return { points: 0, touchdowns: 0, fieldGoals: 0, turnovers: 0, drives: 0 };
}

function applyDrive(stats: TeamGameStats, outcome: DriveOutcome): void {
  stats.drives += 1;
  stats.points += outcome.points;
  if (outcome.points === 7) stats.touchdowns += 1;
  if (outcome.points === 3) stats.fieldGoals += 1;
  if (outcome.turnover) stats.turnovers += 1;
}

/**
 * Simulates one game drive-by-drive. Each team's offense rating is adjusted
 * by their scheme's matchup multiplier against the opponent's defensive
 * scheme (see schemes.ts) plus a small home-field bonus.
 */
export function simulateGame(home: Team, away: Team, rng: SeededRng): GameResult {
  const homeOffenseBase = computeOffenseRating(home) + HOME_FIELD_BONUS;
  const awayOffenseBase = computeOffenseRating(away);
  const homeDefense = computeDefenseRating(home) + HOME_FIELD_BONUS;
  const awayDefense = computeDefenseRating(away);

  const homeOffenseEffective = homeOffenseBase * getSchemeMultiplier(home.scheme.offense, away.scheme.defense);
  const awayOffenseEffective = awayOffenseBase * getSchemeMultiplier(away.scheme.offense, home.scheme.defense);

  const homeStats = emptyStats();
  const awayStats = emptyStats();

  for (let possession = 0; possession < POSSESSIONS_PER_TEAM; possession++) {
    applyDrive(homeStats, simulateDrive(homeOffenseEffective, awayDefense, rng));
    applyDrive(awayStats, simulateDrive(awayOffenseEffective, homeDefense, rng));
  }

  return { homeTeamId: home.id, awayTeamId: away.id, home: homeStats, away: awayStats };
}
