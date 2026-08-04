import { schemeWeightFor, type SchemeId } from "../schemes.js";
import type { Position } from "../types.js";
import {
  POSITION_OVERALL_WEIGHTS,
  type AttributeKey,
  type GeneralAttributeKey,
  type PositionalAttributeKey,
} from "./attributes.js";

export type HealthStatus = "healthy" | "questionable" | "out" | "career-ending";
export type InjurySeverity = "minor" | "major" | "career-ending";

export interface Injury {
  season: number;
  week: number;
  description: string;
  severity: InjurySeverity;
  weeksOut: number;
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
  /** Skill tree nodes taken, in unlock order. */
  unlockedNodeIds: string[];
  /**
   * Flat attribute bonuses from unlocked nodes, kept precomputed so reading an
   * attribute stays O(1) — the sim reads them on every rating calculation.
   */
  skillBonuses: Partial<Record<AttributeKey, number>>;
  health: {
    status: HealthStatus;
    /** Games still to be missed; 0 when available. */
    weeksOut: number;
    injuryHistory: Injury[];
  };
  developmentPoints: number;
}

export type RatedPlayer = Pick<Player, "position" | "general" | "positional"> &
  Partial<Pick<Player, "skillBonuses">>;

const ATTRIBUTE_CEILING = 99;

/** A player's attribute before skill tree development. */
export function getBaseAttribute(player: RatedPlayer, key: AttributeKey): number | undefined {
  if (key in player.general) {
    return player.general[key as GeneralAttributeKey];
  }
  return player.positional[key as PositionalAttributeKey];
}

/**
 * A player's attribute including everything unlocked on their skill tree.
 * Everything downstream — overall ratings, unit ratings, the play engine —
 * reads through here, so a spent development point reaches the scoreboard
 * without any other code needing to know skill trees exist.
 */
export function getAttribute(player: RatedPlayer, key: AttributeKey): number | undefined {
  const base = getBaseAttribute(player, key);
  if (base === undefined) return undefined;
  const bonus = player.skillBonuses?.[key] ?? 0;
  return bonus === 0 ? base : Math.min(ATTRIBUTE_CEILING, base + bonus);
}

/**
 * Weighted 0-99 overall rating, spanning both attribute tiers. Weights are
 * renormalized over the attributes actually present, so a position whose
 * weights reference a missing attribute still produces a sane rating rather
 * than being silently dragged toward zero.
 *
 * Passing a scheme reweights the attributes by what that scheme asks for and
 * returns the player's rating *in that scheme*; omitting it returns their
 * true rating. Nothing is written back — switching scheme changes how a
 * player performs, not who they are.
 *
 * `familiarity` (0-1) scales how much of the scheme's reweighting applies:
 * a scheme a team knows (1) reproduces the full scheme rating, an unknown
 * scheme (0) falls back to neutral weights, and anything between blends.
 * The default keeps every caller that means "rating in this scheme" — draft
 * scouting, the scheme matrix, progression — on full-scheme behaviour.
 */
export function computeOverall(player: RatedPlayer, scheme?: SchemeId, familiarity = 1): number {
  const weights = POSITION_OVERALL_WEIGHTS[player.position];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, baseWeight] of Object.entries(weights) as [AttributeKey, number][]) {
    const value = getAttribute(player, key);
    if (value === undefined) continue;
    const multiplier = scheme === undefined ? 1 : schemeWeightFor(scheme, key);
    const weight = baseWeight * (1 + (multiplier - 1) * familiarity);
    weightedSum += value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}
