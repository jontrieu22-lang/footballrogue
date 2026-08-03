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

function topOverallsAtPosition(roster: Player[], position: Position, count: number): number[] {
  return roster
    .filter((p) => p.position === position && p.health.status !== "career-ending")
    .map((p) => computeOverall(p))
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
): number {
  let total = 0;
  for (const [position, weight] of Object.entries(weights) as [Position, number][]) {
    const count = starters[position] ?? 1;
    total += average(topOverallsAtPosition(roster, position, count)) * weight;
  }
  return total;
}

export function computeOffenseRating(team: Pick<Team, "roster">): number {
  return weightedGroupRating(team.roster, OFFENSE_STARTERS, OFFENSE_GROUP_WEIGHTS);
}

export function computeDefenseRating(team: Pick<Team, "roster">): number {
  return weightedGroupRating(team.roster, DEFENSE_STARTERS, DEFENSE_GROUP_WEIGHTS);
}
