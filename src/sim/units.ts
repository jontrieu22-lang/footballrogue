import type { AttributeKey } from "../models/attributes.js";
import { getAttribute, type Player } from "../models/player.js";
import type { Team } from "../models/team.js";
import { schemeWeightFor, type SchemeId } from "../schemes.js";
import type { Position } from "../types.js";

/**
 * A unit rating answers "how good is this team at one specific job" — passing
 * the ball, stopping the run — by reading the attributes that actually do
 * that job on the players who actually do it.
 *
 * This is what lets the sim tell *how* a team is good rather than only how
 * much: an elite quarterback lifts every pass play, while an elite tight end
 * moves a slice of two units.
 */
export interface UnitGroup {
  position: Position;
  /** How many players at this position contribute. */
  starters: number;
  /** Share of the unit rating this position group carries. */
  weight: number;
  /** Which attributes matter for this job, and how much. */
  attributes: Partial<Record<AttributeKey, number>>;
}

export type UnitSpec = readonly UnitGroup[];

export const PASS_OFFENSE: UnitSpec = [
  {
    position: "QB", starters: 1, weight: 0.45,
    attributes: {
      throwAccuracyShort: 0.28, throwAccuracyDeep: 0.22, throwPower: 0.18,
      awareness: 0.17, throwOnRun: 0.09, playAction: 0.06,
    },
  },
  {
    position: "WR", starters: 3, weight: 0.24,
    attributes: { catching: 0.32, routeRunning: 0.32, release: 0.14, speed: 0.14, catchInTraffic: 0.08 },
  },
  {
    position: "OL", starters: 5, weight: 0.21,
    attributes: { passBlock: 0.78, strength: 0.12, awareness: 0.1 },
  },
  {
    position: "TE", starters: 1, weight: 0.1,
    attributes: { catching: 0.42, routeRunning: 0.28, passBlock: 0.2, catchInTraffic: 0.1 },
  },
];

export const RUSH_OFFENSE: UnitSpec = [
  {
    position: "OL", starters: 5, weight: 0.44,
    attributes: { runBlock: 0.66, strength: 0.2, impactBlock: 0.14 },
  },
  {
    position: "RB", starters: 2, weight: 0.34,
    attributes: { breakTackle: 0.28, vision: 0.24, carrying: 0.18, elusiveness: 0.16, speed: 0.14 },
  },
  {
    position: "TE", starters: 1, weight: 0.16,
    attributes: { runBlock: 0.64, impactBlock: 0.26, strength: 0.1 },
  },
  {
    position: "QB", starters: 1, weight: 0.06,
    attributes: { speed: 0.5, elusiveness: 0.3, awareness: 0.2 },
  },
];

export const PASS_DEFENSE: UnitSpec = [
  {
    position: "CB", starters: 3, weight: 0.34,
    attributes: { manCoverage: 0.3, zoneCoverage: 0.28, press: 0.18, speed: 0.14, playRecognition: 0.1 },
  },
  {
    position: "DL", starters: 4, weight: 0.3,
    attributes: { finesseMoves: 0.34, powerMoves: 0.34, pursuit: 0.2, acceleration: 0.12 },
  },
  {
    position: "S", starters: 2, weight: 0.21,
    attributes: { zoneCoverage: 0.38, playRecognition: 0.28, manCoverage: 0.18, speed: 0.16 },
  },
  {
    position: "LB", starters: 2, weight: 0.15,
    attributes: { zoneCoverage: 0.38, playRecognition: 0.28, manCoverage: 0.22, speed: 0.12 },
  },
];

export const RUSH_DEFENSE: UnitSpec = [
  {
    position: "DL", starters: 4, weight: 0.46,
    attributes: { blockShedding: 0.36, strength: 0.32, tackle: 0.24, pursuit: 0.08 },
  },
  {
    position: "LB", starters: 3, weight: 0.38,
    attributes: { tackle: 0.36, pursuit: 0.28, blockShedding: 0.24, hitPower: 0.12 },
  },
  {
    position: "S", starters: 2, weight: 0.16,
    attributes: { tackle: 0.52, hitPower: 0.28, pursuit: 0.2 },
  },
];

/**
 * A player's score for one job. Scheme emphasis multiplies the attribute
 * weights, so the same roster rates differently depending on what its scheme
 * asks for — see DESIGN.md §6.1.
 */
function attributeScore(
  player: Player,
  attributes: Partial<Record<AttributeKey, number>>,
  scheme?: SchemeId,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, baseWeight] of Object.entries(attributes) as [AttributeKey, number][]) {
    const value = getAttribute(player, key);
    if (value === undefined) continue;
    const weight = scheme === undefined ? baseWeight : baseWeight * schemeWeightFor(scheme, key);
    weightedSum += value * weight;
    totalWeight += weight;
  }

  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

function isAvailable(player: Player): boolean {
  return player.health.status !== "career-ending" && player.health.status !== "out";
}

/**
 * Rating for one job, 0-99ish. Players are ranked by their score *for this
 * job*, so the pass offense uses the best receivers by receiving ability
 * rather than by overall rating.
 */
export function computeUnitRating(roster: Player[], spec: UnitSpec, scheme?: SchemeId): number {
  let total = 0;
  let totalWeight = 0;

  for (const group of spec) {
    const scores = roster
      .filter((p) => p.position === group.position && isAvailable(p))
      .map((p) => attributeScore(p, group.attributes, scheme))
      .sort((a, b) => b - a)
      .slice(0, group.starters);

    if (scores.length === 0) continue;
    const average = scores.reduce((sum, v) => sum + v, 0) / scores.length;
    total += average * group.weight;
    totalWeight += group.weight;
  }

  return totalWeight === 0 ? 0 : total / totalWeight;
}

export interface UnitContribution {
  player: Player;
  /** Fraction of the unit this player accounts for; shares sum to 1. */
  share: number;
}

/**
 * Who actually played in a unit, and how much of it they were. Used to route
 * a unit's expected points added back to the players who generated it, so
 * development is earned rather than handed out.
 */
export function computeUnitContributions(
  roster: Player[],
  spec: UnitSpec,
  scheme?: SchemeId,
): UnitContribution[] {
  const contributions: UnitContribution[] = [];

  for (const group of spec) {
    const ranked = roster
      .filter((p) => p.position === group.position && isAvailable(p))
      .map((player) => ({ player, score: attributeScore(player, group.attributes, scheme) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, group.starters);

    if (ranked.length === 0) continue;
    // Split the group's weight evenly among the starters who filled it.
    const perPlayer = group.weight / ranked.length;
    for (const { player } of ranked) {
      contributions.push({ player, share: perPlayer });
    }
  }

  const total = contributions.reduce((sum, c) => sum + c.share, 0);
  if (total === 0) return contributions;
  return contributions.map((c) => ({ ...c, share: c.share / total }));
}

export interface TeamUnitRatings {
  passOffense: number;
  rushOffense: number;
  passDefense: number;
  rushDefense: number;
}

export function computeTeamUnits(team: Team): TeamUnitRatings {
  return {
    passOffense: computeUnitRating(team.roster, PASS_OFFENSE, team.scheme.offense),
    rushOffense: computeUnitRating(team.roster, RUSH_OFFENSE, team.scheme.offense),
    passDefense: computeUnitRating(team.roster, PASS_DEFENSE, team.scheme.defense),
    rushDefense: computeUnitRating(team.roster, RUSH_DEFENSE, team.scheme.defense),
  };
}

/** Best available player at a position for a given job — used for kicking and punting. */
export function bestAtPosition(
  roster: Player[],
  position: Position,
  attributes: Partial<Record<AttributeKey, number>>,
): Player | undefined {
  let best: Player | undefined;
  let bestScore = -Infinity;
  for (const player of roster) {
    if (player.position !== position || !isAvailable(player)) continue;
    const score = attributeScore(player, attributes);
    if (score > bestScore) {
      bestScore = score;
      best = player;
    }
  }
  return best;
}
