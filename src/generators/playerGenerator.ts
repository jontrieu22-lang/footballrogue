import {
  GENERAL_ATTRIBUTES,
  POSITION_BASELINE_OFFSET,
  POSITION_BASELINES,
  positionalAttributesFor,
  type AttributeKey,
  type GeneralAttributeKey,
  type PositionalAttributeKey,
} from "../models/attributes.js";
import { POSITION_ARCHETYPES, type Archetype } from "../models/archetypes.js";
import type { Player } from "../models/player.js";
import type { SeededRng } from "../rng.js";
import type { Position } from "../types.js";

/**
 * Spread around a position's baseline for a single attribute. Kept moderate
 * because POSITION_BASELINES already carries the positional signal — this is
 * only the player-to-player noise on top of it.
 */
const ATTRIBUTE_STD_DEV = 8;
const ATTRIBUTE_MIN = 20;
const ATTRIBUTE_MAX = 99;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

let nextPlayerId = 1;

/** Reset the module-level id counter — call between independent generation runs (e.g. in tests). */
export function resetPlayerIdCounter(): void {
  nextPlayerId = 1;
}

export interface GeneratePlayerOptions {
  /** Shifts the whole attribute distribution up/down; used for roster tiers and draft-class strength. */
  qualityBias?: number;
  /** Force a specific archetype instead of rolling one. */
  archetypeId?: string;
}

function pickArchetype(position: Position, rng: SeededRng, forcedId?: string): Archetype {
  const archetypes = POSITION_ARCHETYPES[position];
  if (forcedId) {
    const match = archetypes.find((a) => a.id === forcedId);
    if (!match) {
      throw new Error(`Unknown archetype "${forcedId}" for position ${position}`);
    }
    return match;
  }
  return rng.pick(archetypes);
}

export function generatePlayer(
  position: Position,
  rng: SeededRng,
  name: string,
  options: GeneratePlayerOptions = {},
): Player {
  const qualityBias = options.qualityBias ?? 0;
  const archetype = pickArchetype(position, rng, options.archetypeId);

  /**
   * A per-player talent offset applied to every attribute, on top of the
   * per-attribute roll. Without it, averaging many independent rolls makes
   * every player converge on the mean and stars stop existing.
   */
  const talent = rng.gaussian(0, 9);

  const baselines = POSITION_BASELINES[position];
  const positionOffset = POSITION_BASELINE_OFFSET[position];

  const roll = (key: AttributeKey): number => {
    const mean = baselines[key] + positionOffset + qualityBias + talent;
    const base = rng.gaussian(mean, ATTRIBUTE_STD_DEV);
    return clamp(base + (archetype.modifiers[key] ?? 0), ATTRIBUTE_MIN, ATTRIBUTE_MAX);
  };

  const general = {} as Record<GeneralAttributeKey, number>;
  for (const key of GENERAL_ATTRIBUTES) {
    general[key] = roll(key);
  }

  const positional: Partial<Record<PositionalAttributeKey, number>> = {};
  for (const key of positionalAttributesFor(position)) {
    positional[key] = roll(key);
  }

  return {
    id: `p${nextPlayerId++}`,
    name,
    position,
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    age: rng.int(21, 34),
    general,
    positional,
    potential: clamp(rng.gaussian(65 + qualityBias + talent, 13), 40, ATTRIBUTE_MAX),
    unlockedNodeIds: [],
    skillBonuses: {},
    health: { status: "healthy", weeksOut: 0, injuryHistory: [] },
    developmentPoints: 0,
  };
}
