import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import {
  DEFENSE_SCHEMES,
  getSchemeMultiplier,
  OFFENSE_SCHEMES,
} from "../schemes.js";
import type { DefenseSchemeId, OffenseSchemeId } from "../types.js";
import { computeTeamUnits } from "./units.js";

/**
 * The weekly information roll. Three outcomes:
 *
 * - "youRead": the opponent's plan locked first; you see it and pick in
 *   response.
 * - "neither": both commit blind; you get only a fogged scouting report.
 * - "theyRead": you commit first; the AI actively counters your plan.
 *
 * Coach experience shifts the *distribution*, never a coin flip: equal
 * experience lands in "neither" most often, and reads are capped well below
 * certainty. Revealing schemes is enough — tempo is changeable at halftime,
 * so revealing it pre-game would be misleading.
 */
export type RevealOutcome = "youRead" | "neither" | "theyRead";

/**
 * Calibrated so equal experience reads ~27% each side (neither wins the
 * middle ~45%), a full career (20 seasons) reads a rookie ~58%, and the
 * read chance never reaches certainty. See /tmp/opencode/measure-reveal.ts.
 */
const READ_BAND = 0.45;
const READ_PER_EXPERIENCE = 0.03;

export function resolveReveal(
  myExperience: number,
  theirExperience: number,
  rng: SeededRng,
): RevealOutcome {
  const difference = rng.float(-1, 1) + (myExperience - theirExperience) * READ_PER_EXPERIENCE;
  if (difference >= READ_BAND) return "youRead";
  if (difference <= -READ_BAND) return "theyRead";
  return "neither";
}

export interface SchemePair {
  offense: OffenseSchemeId;
  defense: DefenseSchemeId;
}

/**
 * The AI's active counter to a revealed plan: it picks the defense scheme
 * that most hurts your offense and the offense scheme that most exploits
 * your defense, straight off the matchup table. Roster fit is ignored here —
 * that trade-off is Step 4's familiarity calibration.
 */
export function counterPlan(theirOffense: OffenseSchemeId, theirDefense: DefenseSchemeId): SchemePair {
  let defense = DEFENSE_SCHEMES[0]!;
  let offense = OFFENSE_SCHEMES[0]!;
  for (const candidate of DEFENSE_SCHEMES) {
    if (getSchemeMultiplier(theirOffense, candidate) < getSchemeMultiplier(theirOffense, defense)) {
      defense = candidate;
    }
  }
  for (const candidate of OFFENSE_SCHEMES) {
    if (getSchemeMultiplier(candidate, theirDefense) > getSchemeMultiplier(offense, theirDefense)) {
      offense = candidate;
    }
  }
  return { offense, defense };
}

export interface UnitRange {
  low: number;
  high: number;
}

/**
 * What you know about an opponent. Ratings are ranges, never exact numbers,
 * unless you won the read and see their true schemes (the likelihoods then
 * collapse to 1.0 on the truth). Step 5 ties the fuzz to scouting tier.
 */
export interface ScoutingReport {
  units: {
    passOffense: UnitRange;
    rushOffense: UnitRange;
    passDefense: UnitRange;
    rushDefense: UnitRange;
  };
  offenseLikelihood: Record<OffenseSchemeId, number>;
  defenseLikelihood: Record<DefenseSchemeId, number>;
}

/** Shifts the reported rating while keeping it on a 0-99 scale. */
function fuzzRating(rating: number, fuzz: number, rng: SeededRng): UnitRange {
  const error = rng.gaussian(0, fuzz);
  const low = Math.max(0, Math.min(99, rating - fuzz + error));
  const high = Math.max(0, Math.min(99, rating + fuzz + error));
  return { low: Math.round(low), high: Math.round(high) };
}

/**
 * How fuzzy a weekly scouting report is, in rating points, at a given
 * scouting tier — the meta-progression twin of scoutingError in
 * draftClass.ts. Tier 0 is a rough guess; the top tier is nearly exact.
 */
export function scoutingFuzz(scoutingTier: number): number {
  return Math.max(2, 10 - scoutingTier * 1.6);
}

function likelihood<T extends string>(truth: T, options: readonly T[], rng: SeededRng): Record<T, number> {
  const weights = options.map((option) =>
    option === truth ? rng.float(0.55, 0.8) : rng.float(0.05, 0.3),
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  return Object.fromEntries(
    options.map((option, i) => [option, weights[i]! / total]),
  ) as Record<T, number>;
}

/**
 * A fogged report on a team. `fuzz` is the rating error in points (smaller
 * = sharper scouting). Winning the read returns exact schemes: pass
 * `revealed: true` and the likelihoods resolve to the truth.
 */
export function scoutingReport(
  team: Team,
  rng: SeededRng,
  fuzz: number,
  revealed: boolean,
): ScoutingReport {
  const offenseLikelihood: Record<OffenseSchemeId, number> = revealed
    ? Object.fromEntries(OFFENSE_SCHEMES.map((s) => [s, s === team.scheme.offense ? 1 : 0])) as Record<
        OffenseSchemeId,
        number
      >
    : likelihood(team.scheme.offense, OFFENSE_SCHEMES, rng);
  const defenseLikelihood: Record<DefenseSchemeId, number> = revealed
    ? Object.fromEntries(DEFENSE_SCHEMES.map((s) => [s, s === team.scheme.defense ? 1 : 0])) as Record<
        DefenseSchemeId,
        number
      >
    : likelihood(team.scheme.defense, DEFENSE_SCHEMES, rng);

  const units = computeTeamUnits(team);
  return {
    units: {
      passOffense: revealed
        ? { low: units.passOffense, high: units.passOffense }
        : fuzzRating(units.passOffense, fuzz, rng),
      rushOffense: revealed
        ? { low: units.rushOffense, high: units.rushOffense }
        : fuzzRating(units.rushOffense, fuzz, rng),
      passDefense: revealed
        ? { low: units.passDefense, high: units.passDefense }
        : fuzzRating(units.passDefense, fuzz, rng),
      rushDefense: revealed
        ? { low: units.rushDefense, high: units.rushDefense }
        : fuzzRating(units.rushDefense, fuzz, rng),
    },
    offenseLikelihood,
    defenseLikelihood,
  };
}
