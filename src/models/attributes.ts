import type { Position } from "../types.js";

/**
 * Attributes are split into two tiers, Madden-style:
 *
 *  - GENERAL: physical/mental traits every player has, regardless of position.
 *  - POSITIONAL: skill groups that only exist for positions that use them. A
 *    cornerback simply has no `throwPower` — the attribute is absent rather
 *    than present-but-meaningless, so a player card only ever renders stats
 *    that matter for that position.
 */

export const GENERAL_ATTRIBUTES = [
  "speed",
  "acceleration",
  "agility",
  "strength",
  "awareness",
  "stamina",
  "injuryResistance",
] as const;

export type GeneralAttributeKey = (typeof GENERAL_ATTRIBUTES)[number];

/** Positional skills, grouped. A position gets all attributes of each group it uses. */
export const ATTRIBUTE_GROUPS = {
  passing: ["throwPower", "throwAccuracyShort", "throwAccuracyDeep", "throwOnRun", "playAction"],
  rushing: ["carrying", "breakTackle", "elusiveness", "vision"],
  receiving: ["catching", "catchInTraffic", "routeRunning", "release"],
  blocking: ["runBlock", "passBlock", "impactBlock"],
  passRush: ["powerMoves", "finesseMoves", "blockShedding", "pursuit"],
  tackling: ["tackle", "hitPower"],
  coverage: ["manCoverage", "zoneCoverage", "press", "playRecognition"],
  kicking: ["kickPower", "kickAccuracy"],
} as const;

export type AttributeGroupName = keyof typeof ATTRIBUTE_GROUPS;
export type PositionalAttributeKey = (typeof ATTRIBUTE_GROUPS)[AttributeGroupName][number];
export type AttributeKey = GeneralAttributeKey | PositionalAttributeKey;

/** Which positional skill groups each position possesses. */
export const POSITION_GROUPS: Record<Position, readonly AttributeGroupName[]> = {
  QB: ["passing", "rushing"],
  RB: ["rushing", "receiving", "blocking"],
  WR: ["receiving", "rushing"],
  TE: ["receiving", "blocking"],
  OL: ["blocking"],
  DL: ["passRush", "tackling"],
  LB: ["tackling", "passRush", "coverage"],
  CB: ["coverage", "tackling"],
  S: ["coverage", "tackling"],
  K: ["kicking"],
  P: ["kicking"],
};

/** Short labels for player-card display, following Madden's abbreviation style. */
export const ATTRIBUTE_LABELS: Record<AttributeKey, { name: string; abbr: string }> = {
  speed: { name: "Speed", abbr: "SPD" },
  acceleration: { name: "Acceleration", abbr: "ACC" },
  agility: { name: "Agility", abbr: "AGI" },
  strength: { name: "Strength", abbr: "STR" },
  awareness: { name: "Awareness", abbr: "AWR" },
  stamina: { name: "Stamina", abbr: "STA" },
  injuryResistance: { name: "Injury Resistance", abbr: "INJ" },

  throwPower: { name: "Throw Power", abbr: "THP" },
  throwAccuracyShort: { name: "Short Accuracy", abbr: "SAC" },
  throwAccuracyDeep: { name: "Deep Accuracy", abbr: "DAC" },
  throwOnRun: { name: "Throw On Run", abbr: "TOR" },
  playAction: { name: "Play Action", abbr: "PAC" },

  carrying: { name: "Carrying", abbr: "CAR" },
  breakTackle: { name: "Break Tackle", abbr: "BTK" },
  elusiveness: { name: "Elusiveness", abbr: "ELU" },
  vision: { name: "Ball Carrier Vision", abbr: "BCV" },

  catching: { name: "Catching", abbr: "CTH" },
  catchInTraffic: { name: "Catch In Traffic", abbr: "CIT" },
  routeRunning: { name: "Route Running", abbr: "RTE" },
  release: { name: "Release", abbr: "RLS" },

  runBlock: { name: "Run Block", abbr: "RBK" },
  passBlock: { name: "Pass Block", abbr: "PBK" },
  impactBlock: { name: "Impact Block", abbr: "IBL" },

  powerMoves: { name: "Power Moves", abbr: "PMV" },
  finesseMoves: { name: "Finesse Moves", abbr: "FMV" },
  blockShedding: { name: "Block Shedding", abbr: "BSH" },
  pursuit: { name: "Pursuit", abbr: "PUR" },

  tackle: { name: "Tackle", abbr: "TAK" },
  hitPower: { name: "Hit Power", abbr: "POW" },

  manCoverage: { name: "Man Coverage", abbr: "MCV" },
  zoneCoverage: { name: "Zone Coverage", abbr: "ZCV" },
  press: { name: "Press", abbr: "PRS" },
  playRecognition: { name: "Play Recognition", abbr: "PRC" },

  kickPower: { name: "Kick Power", abbr: "KPW" },
  kickAccuracy: { name: "Kick Accuracy", abbr: "KAC" },
};

export const GROUP_LABELS: Record<AttributeGroupName, string> = {
  passing: "Passing",
  rushing: "Ball Carrying",
  receiving: "Receiving",
  blocking: "Blocking",
  passRush: "Pass Rush",
  tackling: "Tackling",
  coverage: "Coverage",
  kicking: "Kicking",
};

/**
 * Per-position weights for the 0-99 overall rating. Each position's weights
 * sum to 1.0 and span both tiers, so a corner's overall is driven by speed
 * and coverage while a lineman's is driven by strength and blocking.
 */
export const POSITION_OVERALL_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  QB: {
    awareness: 0.12, speed: 0.08, agility: 0.07, strength: 0.05,
    throwAccuracyShort: 0.2, throwPower: 0.15, throwAccuracyDeep: 0.15,
    throwOnRun: 0.1, playAction: 0.08,
  },
  RB: {
    speed: 0.18, acceleration: 0.12, agility: 0.1, strength: 0.06, awareness: 0.04,
    carrying: 0.12, breakTackle: 0.12, elusiveness: 0.1, vision: 0.1,
    catching: 0.06,
  },
  WR: {
    speed: 0.18, acceleration: 0.1, agility: 0.08, awareness: 0.04, strength: 0.03,
    catching: 0.2, routeRunning: 0.18, catchInTraffic: 0.1, release: 0.09,
  },
  TE: {
    strength: 0.1, speed: 0.08, awareness: 0.05, acceleration: 0.05, agility: 0.04,
    catching: 0.18, routeRunning: 0.12, catchInTraffic: 0.1,
    runBlock: 0.15, passBlock: 0.08, impactBlock: 0.05,
  },
  OL: {
    strength: 0.22, awareness: 0.1, agility: 0.05, acceleration: 0.03,
    passBlock: 0.28, runBlock: 0.25, impactBlock: 0.07,
  },
  DL: {
    strength: 0.18, acceleration: 0.08, awareness: 0.06, speed: 0.05, agility: 0.03,
    powerMoves: 0.16, finesseMoves: 0.14, blockShedding: 0.14, pursuit: 0.06,
    tackle: 0.08, hitPower: 0.02,
  },
  LB: {
    speed: 0.1, strength: 0.08, awareness: 0.08, acceleration: 0.06, agility: 0.04,
    tackle: 0.16, hitPower: 0.08,
    blockShedding: 0.08, pursuit: 0.08, powerMoves: 0.03, finesseMoves: 0.03,
    zoneCoverage: 0.1, manCoverage: 0.05, playRecognition: 0.03,
  },
  CB: {
    speed: 0.18, acceleration: 0.1, agility: 0.1, awareness: 0.05, strength: 0.02,
    manCoverage: 0.2, zoneCoverage: 0.16, press: 0.1, playRecognition: 0.05,
    tackle: 0.04,
  },
  S: {
    speed: 0.13, awareness: 0.08, acceleration: 0.07, agility: 0.06, strength: 0.04,
    zoneCoverage: 0.18, manCoverage: 0.1, playRecognition: 0.08, press: 0.02,
    tackle: 0.16, hitPower: 0.08,
  },
  K: { awareness: 0.1, kickPower: 0.45, kickAccuracy: 0.45 },
  P: { awareness: 0.1, kickPower: 0.45, kickAccuracy: 0.45 },
};

/**
 * Average value of each attribute at each position, before per-player talent,
 * archetype, and roster-tier adjustments. This is what makes positions feel
 * distinct: receivers are fast and can't block, linemen are strong and slow,
 * and a running back's pass blocking tops out well below a tackle's.
 *
 * Every attribute a position has must appear here — enforced by tests.
 */
export const POSITION_BASELINES: Record<Position, Record<AttributeKey, number>> = {
  QB: {
    speed: 55, acceleration: 58, agility: 60, strength: 60, awareness: 68, stamina: 70, injuryResistance: 68,
    throwPower: 72, throwAccuracyShort: 70, throwAccuracyDeep: 66, throwOnRun: 60, playAction: 62,
    carrying: 45, breakTackle: 35, elusiveness: 42, vision: 42,
  } as Record<AttributeKey, number>,
  RB: {
    speed: 82, acceleration: 84, agility: 80, strength: 62, awareness: 58, stamina: 72, injuryResistance: 62,
    carrying: 78, breakTackle: 66, elusiveness: 70, vision: 70,
    catching: 55, catchInTraffic: 45, routeRunning: 46, release: 42,
    runBlock: 36, passBlock: 42, impactBlock: 38,
  } as Record<AttributeKey, number>,
  WR: {
    speed: 88, acceleration: 88, agility: 84, strength: 50, awareness: 60, stamina: 72, injuryResistance: 62,
    catching: 78, catchInTraffic: 66, routeRunning: 72, release: 68,
    carrying: 60, breakTackle: 40, elusiveness: 62, vision: 52,
  } as Record<AttributeKey, number>,
  TE: {
    speed: 70, acceleration: 72, agility: 66, strength: 72, awareness: 62, stamina: 70, injuryResistance: 66,
    catching: 70, catchInTraffic: 66, routeRunning: 62, release: 56,
    runBlock: 64, passBlock: 58, impactBlock: 62,
  } as Record<AttributeKey, number>,
  OL: {
    speed: 52, acceleration: 58, agility: 52, strength: 88, awareness: 66, stamina: 72, injuryResistance: 70,
    runBlock: 76, passBlock: 76, impactBlock: 68,
  } as Record<AttributeKey, number>,
  DL: {
    speed: 66, acceleration: 72, agility: 62, strength: 85, awareness: 62, stamina: 70, injuryResistance: 68,
    powerMoves: 70, finesseMoves: 66, blockShedding: 70, pursuit: 66,
    tackle: 68, hitPower: 68,
  } as Record<AttributeKey, number>,
  LB: {
    speed: 76, acceleration: 78, agility: 72, strength: 72, awareness: 66, stamina: 74, injuryResistance: 68,
    tackle: 78, hitPower: 74,
    powerMoves: 56, finesseMoves: 56, blockShedding: 60, pursuit: 74,
    manCoverage: 52, zoneCoverage: 58, press: 46, playRecognition: 62,
  } as Record<AttributeKey, number>,
  CB: {
    speed: 90, acceleration: 90, agility: 88, strength: 48, awareness: 62, stamina: 72, injuryResistance: 62,
    manCoverage: 76, zoneCoverage: 72, press: 66, playRecognition: 62,
    tackle: 48, hitPower: 45,
  } as Record<AttributeKey, number>,
  S: {
    speed: 84, acceleration: 84, agility: 78, strength: 58, awareness: 66, stamina: 72, injuryResistance: 64,
    manCoverage: 62, zoneCoverage: 72, press: 50, playRecognition: 68,
    tackle: 68, hitPower: 66,
  } as Record<AttributeKey, number>,
  K: {
    speed: 45, acceleration: 48, agility: 48, strength: 52, awareness: 56, stamina: 62, injuryResistance: 72,
    kickPower: 78, kickAccuracy: 78,
  } as Record<AttributeKey, number>,
  P: {
    speed: 45, acceleration: 48, agility: 48, strength: 52, awareness: 56, stamina: 62, injuryResistance: 72,
    kickPower: 78, kickAccuracy: 78,
  } as Record<AttributeKey, number>,
};

/** All positional attribute keys a given position actually has. */
export function positionalAttributesFor(position: Position): PositionalAttributeKey[] {
  return POSITION_GROUPS[position].flatMap((group) => [...ATTRIBUTE_GROUPS[group]]);
}

/** Overall rating a perfectly average player at this position would have from baselines alone. */
export function baselineOverall(position: Position): number {
  const weights = POSITION_OVERALL_WEIGHTS[position];
  const baselines = POSITION_BASELINES[position];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    weightedSum += baselines[key] * weight;
    totalWeight += weight;
  }
  return weightedSum / totalWeight;
}

/** Mean overall every position is normalized to, so ratings are comparable league-wide. */
export const TARGET_POSITION_OVERALL = 70;

/**
 * Per-position constant added to every attribute so each position's mean
 * overall lands on TARGET_POSITION_OVERALL. Without it, positions whose
 * weights emphasize naturally-high attributes (a corner's speed) would
 * out-rate positions whose weights don't (a quarterback's), skewing team
 * ratings. Derived from the baselines, so retuning them stays consistent.
 */
export const POSITION_BASELINE_OFFSET: Record<Position, number> = Object.fromEntries(
  (Object.keys(POSITION_BASELINES) as Position[]).map((position) => [
    position,
    TARGET_POSITION_OVERALL - baselineOverall(position),
  ]),
) as Record<Position, number>;
