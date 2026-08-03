import type { Position } from "../types.js";
import {
  POSITION_OVERALL_WEIGHTS,
  type AttributeKey,
  type GeneralAttributeKey,
  type PositionalAttributeKey,
} from "./attributes.js";

export interface Injury {
  week: number;
  description: string;
  severity: "minor" | "major" | "career-ending";
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** Archetype id from POSITION_ARCHETYPES — drives scheme fit. */
  archetypeId: string;
  archetypeName: string;
  age: number;
  /** Physical/mental traits — every player has all of these. */
  general: Record<GeneralAttributeKey, number>;
  /** Position skills — only the groups this position uses are present. */
  positional: Partial<Record<PositionalAttributeKey, number>>;
  /** Hidden ceiling (0-99) — only fuzzily known until scouted, see DESIGN.md §8. */
  potential: number;
  health: {
    status: "healthy" | "questionable" | "out" | "career-ending";
    injuryHistory: Injury[];
  };
  developmentPoints: number;
}

export type RatedPlayer = Pick<Player, "position" | "general" | "positional">;

/** Reads an attribute from whichever tier holds it, or undefined if the position lacks it. */
export function getAttribute(player: RatedPlayer, key: AttributeKey): number | undefined {
  if (key in player.general) {
    return player.general[key as GeneralAttributeKey];
  }
  return player.positional[key as PositionalAttributeKey];
}

/**
 * Weighted 0-99 overall rating, spanning both attribute tiers. Weights are
 * renormalized over the attributes actually present so a position whose
 * weights reference a missing attribute still produces a sane rating rather
 * than being silently dragged toward zero.
 */
export function computeOverall(player: RatedPlayer): number {
  const weights = POSITION_OVERALL_WEIGHTS[player.position];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    const value = getAttribute(player, key);
    if (value === undefined) continue;
    weightedSum += value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}
