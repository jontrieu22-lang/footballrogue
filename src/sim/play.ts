import type { SeededRng } from "../rng.js";
import type { TeamUnitRatings } from "./units.js";

export type PlayType = "run" | "pass";

export interface PlayResult {
  type: PlayType;
  yards: number;
  /** Possession lost on this play. */
  turnover: boolean;
  /** Pass fell incomplete — clock stops. */
  incomplete: boolean;
  sacked: boolean;
  /** Seconds of game clock consumed, including the huddle before the snap. */
  clockSeconds: number;
}

/**
 * Rating gaps are divided by these to convert into play outcomes. Larger
 * numbers make talent matter less. Tuned so a league-average matchup produces
 * roughly NFL rates (~4.3 yards per carry, ~63% completions) and so the
 * best-vs-worst matchup is decisive without being deterministic.
 */
const PASS_COMPLETION_SCALE = 220;
const PASS_YARDS_SCALE = 14;
const RUN_YARDS_SCALE = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolvePass(offense: TeamUnitRatings, defense: TeamUnitRatings, rng: SeededRng): PlayResult {
  const diff = offense.passOffense - defense.passDefense;

  const sackProbability = clamp(0.068 - diff / 900, 0.015, 0.16);
  if (rng.chance(sackProbability)) {
    return {
      type: "pass",
      yards: -Math.round(clamp(rng.gaussian(7, 2.2), 1, 15)),
      turnover: false,
      incomplete: false,
      sacked: true,
      clockSeconds: 34,
    };
  }

  const interceptionProbability = clamp(0.026 - diff / 2200, 0.007, 0.055);
  if (rng.chance(interceptionProbability)) {
    return { type: "pass", yards: 0, turnover: true, incomplete: false, sacked: false, clockSeconds: 12 };
  }

  const completionProbability = clamp(0.652 + diff / PASS_COMPLETION_SCALE, 0.36, 0.84);
  if (!rng.chance(completionProbability)) {
    return { type: "pass", yards: 0, turnover: false, incomplete: true, sacked: false, clockSeconds: 7 };
  }

  // Completions are right-skewed: mostly short gains with an occasional
  // explosive play, rather than a symmetric spread around the mean.
  const base = rng.gaussian(8.6 + diff / PASS_YARDS_SCALE, 6.7);
  const explosive = rng.chance(0.07) ? rng.float(10, 45) : 0;
  const yards = Math.round(clamp(base + explosive, -3, 99));

  return { type: "pass", yards, turnover: false, incomplete: false, sacked: false, clockSeconds: 33 };
}

function resolveRun(offense: TeamUnitRatings, defense: TeamUnitRatings, rng: SeededRng): PlayResult {
  const diff = offense.rushOffense - defense.rushDefense;

  const fumbleProbability = clamp(0.011 - diff / 5000, 0.003, 0.024);
  if (rng.chance(fumbleProbability)) {
    return { type: "run", yards: 0, turnover: true, incomplete: false, sacked: false, clockSeconds: 36 };
  }

  const base = rng.gaussian(4.4 + diff / RUN_YARDS_SCALE, 3.8);
  const breakaway = rng.chance(0.035) ? rng.float(8, 40) : 0;
  const yards = Math.round(clamp(base + breakaway, -5, 99));

  return { type: "run", yards, turnover: false, incomplete: false, sacked: false, clockSeconds: 38 };
}

export function resolvePlay(
  type: PlayType,
  offense: TeamUnitRatings,
  defense: TeamUnitRatings,
  rng: SeededRng,
): PlayResult {
  return type === "pass" ? resolvePass(offense, defense, rng) : resolveRun(offense, defense, rng);
}
