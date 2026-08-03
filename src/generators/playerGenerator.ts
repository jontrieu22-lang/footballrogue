import { POSITION_ATTRIBUTE_WEIGHTS, type Player } from "../models/player.js";
import type { SeededRng } from "../rng.js";
import type { AttributeKey, Position } from "../types.js";

const ALL_ATTRIBUTES: AttributeKey[] = [
  "speed",
  "strength",
  "awareness",
  "throwing",
  "catching",
  "blocking",
  "tackling",
  "coverage",
  "kicking",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

let nextPlayerId = 1;

/** Reset the module-level id counter — call between independent generation runs (e.g. in tests). */
export function resetPlayerIdCounter(): void {
  nextPlayerId = 1;
}

export interface GeneratePlayerOptions {
  /** Shifts the whole attribute distribution up/down; used for draft-class strength tiers later. */
  qualityBias?: number;
}

export function generatePlayer(
  position: Position,
  rng: SeededRng,
  name: string,
  options: GeneratePlayerOptions = {},
): Player {
  const weights = POSITION_ATTRIBUTE_WEIGHTS[position];
  const qualityBias = options.qualityBias ?? 0;

  const attributes = {} as Record<AttributeKey, number>;
  for (const attr of ALL_ATTRIBUTES) {
    const isRelevant = (weights[attr] ?? 0) > 0;
    const baseline = isRelevant ? 62 + qualityBias : 30 + qualityBias * 0.5;
    const stdDev = isRelevant ? 14 : 10;
    attributes[attr] = clamp(rng.gaussian(baseline, stdDev), 20, 99);
  }

  const potential = clamp(rng.gaussian(65 + qualityBias, 15), 40, 99);

  return {
    id: `p${nextPlayerId++}`,
    name,
    position,
    age: rng.int(21, 34),
    attributes,
    potential,
    health: { status: "healthy", injuryHistory: [] },
    developmentPoints: 0,
  };
}
