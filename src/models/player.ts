import type { AttributeKey, Position } from "../types.js";

export interface Injury {
  week: number;
  description: string;
  severity: "minor" | "major" | "career-ending";
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  age: number;
  attributes: Record<AttributeKey, number>;
  /** Hidden ceiling (0-99) — only fuzzily known until scouted, see design doc §8. */
  potential: number;
  health: {
    status: "healthy" | "questionable" | "out" | "career-ending";
    injuryHistory: Injury[];
  };
  developmentPoints: number;
}

/**
 * Weights (summing to 1) mapping each position's attributes to its overall
 * rating. Positions ignore attributes that don't apply to them.
 */
export const POSITION_ATTRIBUTE_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  QB: { throwing: 0.5, awareness: 0.3, speed: 0.1, strength: 0.1 },
  RB: { speed: 0.35, strength: 0.25, catching: 0.15, awareness: 0.15, blocking: 0.1 },
  WR: { speed: 0.35, catching: 0.4, awareness: 0.15, strength: 0.1 },
  TE: { catching: 0.3, blocking: 0.3, strength: 0.2, speed: 0.1, awareness: 0.1 },
  OL: { blocking: 0.55, strength: 0.3, awareness: 0.15 },
  DL: { strength: 0.4, tackling: 0.3, speed: 0.15, awareness: 0.15 },
  LB: { tackling: 0.35, awareness: 0.25, speed: 0.25, coverage: 0.15 },
  CB: { coverage: 0.4, speed: 0.35, awareness: 0.15, tackling: 0.1 },
  S: { coverage: 0.3, tackling: 0.3, speed: 0.2, awareness: 0.2 },
  K: { kicking: 0.8, awareness: 0.2 },
  P: { kicking: 0.8, awareness: 0.2 },
};

/** Weighted 0-99 overall rating for a player, derived from raw attributes. */
export function computeOverall(player: Pick<Player, "position" | "attributes">): number {
  const weights = POSITION_ATTRIBUTE_WEIGHTS[player.position];
  let total = 0;
  for (const [attr, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += (player.attributes[attr] ?? 0) * weight;
  }
  return Math.round(total);
}
