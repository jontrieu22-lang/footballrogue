import type { SchemeId } from "../schemes.js";
import type { DefenseSchemeId, OffenseSchemeId, Position } from "../types.js";
import { computeOverall, type Player } from "./player.js";

export interface DraftPick {
  season: number;
  round: number;
  /** Team the pick originally belonged to, for trade provenance. */
  originalTeamId: string;
}

export interface Team {
  id: string;
  name: string;
  roster: Player[];
  scheme: { offense: OffenseSchemeId; defense: DefenseSchemeId };
  franchisePoints: number;
  draftPicks: DraftPick[];
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
}

/** How many top-graded players at each position count toward the team rating. */
const OFFENSE_STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 2, WR: 3, TE: 1, OL: 5 };
const DEFENSE_STARTERS: Partial<Record<Position, number>> = { DL: 4, LB: 3, CB: 2, S: 2 };

const OFFENSE_GROUP_WEIGHTS: Partial<Record<Position, number>> = {
  QB: 0.3,
  OL: 0.25,
  WR: 0.2,
  RB: 0.15,
  TE: 0.1,
};
const DEFENSE_GROUP_WEIGHTS: Partial<Record<Position, number>> = {
  DL: 0.3,
  LB: 0.25,
  CB: 0.25,
  S: 0.2,
};

function topOverallsAtPosition(
  roster: Player[],
  position: Position,
  count: number,
  scheme?: SchemeId,
): number[] {
  return roster
    .filter((p) => p.position === position && p.health.status !== "career-ending")
    .map((p) => computeOverall(p, scheme))
    .sort((a, b) => b - a)
    .slice(0, count);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weightedGroupRating(
  roster: Player[],
  starters: Partial<Record<Position, number>>,
  weights: Partial<Record<Position, number>>,
  scheme?: SchemeId,
): number {
  let total = 0;
  for (const [position, weight] of Object.entries(weights) as [Position, number][]) {
    const count = starters[position] ?? 1;
    total += average(topOverallsAtPosition(roster, position, count, scheme)) * weight;
  }
  return total;
}

export type RatedTeam = Pick<Team, "roster" | "scheme">;

/**
 * Both ratings are computed *in the team's own scheme*, so a roster stocked
 * with players who fit it rates higher than the same talent in a scheme that
 * wastes them. This is what makes roster construction a real decision.
 */
export function computeOffenseRating(team: RatedTeam): number {
  return weightedGroupRating(team.roster, OFFENSE_STARTERS, OFFENSE_GROUP_WEIGHTS, team.scheme.offense);
}

export function computeDefenseRating(team: RatedTeam): number {
  return weightedGroupRating(team.roster, DEFENSE_STARTERS, DEFENSE_GROUP_WEIGHTS, team.scheme.defense);
}

/** Ratings ignoring scheme — the raw talent on the roster, for scouting/trade valuation. */
export function computeRawOffenseRating(team: Pick<Team, "roster">): number {
  return weightedGroupRating(team.roster, OFFENSE_STARTERS, OFFENSE_GROUP_WEIGHTS);
}

export function computeRawDefenseRating(team: Pick<Team, "roster">): number {
  return weightedGroupRating(team.roster, DEFENSE_STARTERS, DEFENSE_GROUP_WEIGHTS);
}
