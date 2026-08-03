import type { AttributeKey } from "./models/attributes.js";
import type { DefenseSchemeId, OffenseSchemeId, Position } from "./types.js";

export type SchemeId = OffenseSchemeId | DefenseSchemeId;

export const OFFENSE_SCHEMES: readonly OffenseSchemeId[] = ["powerRun", "airRaid", "westCoast", "rpo"];
export const DEFENSE_SCHEMES: readonly DefenseSchemeId[] = ["base43", "odd34", "cover2Zone", "blitzMan"];

export const OFFENSE_POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "OL"];
export const DEFENSE_POSITIONS: readonly Position[] = ["DL", "LB", "CB", "S"];

export const SCHEME_LABELS: Record<SchemeId, string> = {
  powerRun: "Power Run",
  airRaid: "Air Raid",
  westCoast: "West Coast",
  rpo: "RPO / Spread",
  base43: "4-3 Base",
  odd34: "3-4 Odd",
  cover2Zone: "Cover-2 Zone",
  blitzMan: "Blitz-Heavy Man",
};

/**
 * What each scheme asks of its players. A scheme changes *which traits count*
 * rather than inflating their values: running Cover-2 makes zone coverage and
 * play recognition the things that decide a corner's worth, and makes press
 * technique nearly irrelevant.
 *
 * This has to act on the rating weights, not on the attributes themselves. A
 * corner's overall permanently weights man coverage (0.20) above zone (0.16),
 * so a straight value bonus leaves a man specialist out-rating a zone
 * specialist even inside a zone scheme — the wrong trait keeps the heavier
 * weight. Reweighting fixes it at the source.
 */
export interface SchemeEmphasis {
  /** Traits the scheme is built around. */
  core: readonly AttributeKey[];
  /** Traits that help but aren't the point. */
  support: readonly AttributeKey[];
  /** Traits this scheme largely wastes. */
  deEmphasis: readonly AttributeKey[];
}

const CORE_WEIGHT = 2.0;
const SUPPORT_WEIGHT = 1.4;
const DE_EMPHASIS_WEIGHT = 0.5;

export const SCHEME_EMPHASIS: Record<SchemeId, SchemeEmphasis> = {
  powerRun: {
    core: ["runBlock", "impactBlock", "breakTackle"],
    support: ["strength", "carrying", "vision"],
    deEmphasis: ["throwAccuracyDeep", "throwPower", "release", "routeRunning"],
  },
  airRaid: {
    core: ["throwPower", "throwAccuracyDeep", "release", "routeRunning"],
    support: ["speed", "catching"],
    deEmphasis: ["runBlock", "impactBlock", "breakTackle", "carrying"],
  },
  westCoast: {
    core: ["throwAccuracyShort", "routeRunning", "catchInTraffic"],
    support: ["awareness", "agility", "passBlock"],
    deEmphasis: ["throwPower", "throwAccuracyDeep", "breakTackle"],
  },
  rpo: {
    core: ["throwOnRun", "elusiveness", "playAction"],
    support: ["agility", "vision", "acceleration"],
    deEmphasis: ["throwPower", "impactBlock", "catchInTraffic"],
  },
  base43: {
    core: ["tackle", "pursuit"],
    support: ["blockShedding", "awareness", "zoneCoverage"],
    deEmphasis: ["press", "finesseMoves"],
  },
  odd34: {
    core: ["powerMoves", "blockShedding"],
    support: ["strength", "hitPower", "tackle"],
    deEmphasis: ["press", "finesseMoves"],
  },
  cover2Zone: {
    core: ["zoneCoverage", "playRecognition"],
    support: ["awareness", "pursuit"],
    deEmphasis: ["manCoverage", "press"],
  },
  blitzMan: {
    core: ["manCoverage", "press", "finesseMoves"],
    support: ["powerMoves", "acceleration"],
    deEmphasis: ["zoneCoverage", "playRecognition"],
  },
};

const SCHEME_WEIGHT_MULTIPLIERS: Record<SchemeId, Partial<Record<AttributeKey, number>>> =
  Object.fromEntries(
    (Object.entries(SCHEME_EMPHASIS) as [SchemeId, SchemeEmphasis][]).map(([scheme, emphasis]) => {
      const multipliers: Partial<Record<AttributeKey, number>> = {};
      for (const key of emphasis.core) multipliers[key] = CORE_WEIGHT;
      for (const key of emphasis.support) multipliers[key] = SUPPORT_WEIGHT;
      for (const key of emphasis.deEmphasis) multipliers[key] = DE_EMPHASIS_WEIGHT;
      return [scheme, multipliers];
    }),
  ) as Record<SchemeId, Partial<Record<AttributeKey, number>>>;

/** How much this scheme multiplies an attribute's weight in a player's rating. */
export function schemeWeightFor(scheme: SchemeId, key: AttributeKey): number {
  return SCHEME_WEIGHT_MULTIPLIERS[scheme][key] ?? 1;
}

export type EmphasisLevel = "core" | "support" | "neutral" | "deEmphasis";

/** How a scheme regards one attribute — used to annotate player cards. */
export function emphasisLevelFor(scheme: SchemeId, key: AttributeKey): EmphasisLevel {
  const emphasis = SCHEME_EMPHASIS[scheme];
  if (emphasis.core.includes(key)) return "core";
  if (emphasis.support.includes(key)) return "support";
  if (emphasis.deEmphasis.includes(key)) return "deEmphasis";
  return "neutral";
}

/** Which of a team's two schemes governs a player, or undefined for special teams. */
export function schemeForPosition(
  position: Position,
  schemes: { offense: OffenseSchemeId; defense: DefenseSchemeId },
): SchemeId | undefined {
  if (OFFENSE_POSITIONS.includes(position)) return schemes.offense;
  if (DEFENSE_POSITIONS.includes(position)) return schemes.defense;
  return undefined;
}

/**
 * Multiplier applied to the offense's effective rating for a given
 * offense-vs-defense scheme matchup. Separate from SCHEME_BOOSTS: boosts are
 * how well your roster *fits* your scheme, this is how your scheme *counters*
 * theirs. 1.0 is neutral; >1 favors the offense. Deliberately a soft web
 * rather than a strict rock-paper-scissors cycle — see DESIGN.md §6.
 */
const SCHEME_MATCHUPS: Record<OffenseSchemeId, Record<DefenseSchemeId, number>> = {
  powerRun: { base43: 0.97, odd34: 0.95, cover2Zone: 1.08, blitzMan: 1.02 },
  airRaid: { base43: 1.0, odd34: 1.03, cover2Zone: 0.92, blitzMan: 1.05 },
  westCoast: { base43: 1.02, odd34: 1.0, cover2Zone: 1.0, blitzMan: 0.9 },
  rpo: { base43: 1.03, odd34: 0.98, cover2Zone: 1.0, blitzMan: 1.08 },
};

export function getSchemeMultiplier(offense: OffenseSchemeId, defense: DefenseSchemeId): number {
  return SCHEME_MATCHUPS[offense][defense];
}
