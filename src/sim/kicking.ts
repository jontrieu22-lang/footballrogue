import type { Player } from "../models/player.js";
import type { SeededRng } from "../rng.js";
import { bestAtPosition } from "./units.js";

/** Yards from the line of scrimmage to the goal posts: end zone plus the snap. */
const KICK_SNAP_DISTANCE = 17;

const KICKER_ATTRIBUTES = { kickPower: 0.5, kickAccuracy: 0.5 };
const PUNTER_ATTRIBUTES = { kickPower: 0.6, kickAccuracy: 0.4 };

export interface Kicker {
  power: number;
  accuracy: number;
}

const REPLACEMENT_KICKER: Kicker = { power: 55, accuracy: 55 };

function toKicker(player: Player | undefined): Kicker {
  if (!player) return REPLACEMENT_KICKER;
  return {
    power: player.positional.kickPower ?? REPLACEMENT_KICKER.power,
    accuracy: player.positional.kickAccuracy ?? REPLACEMENT_KICKER.accuracy,
  };
}

export function getKicker(roster: Player[]): Kicker {
  return toKicker(bestAtPosition(roster, "K", KICKER_ATTRIBUTES));
}

export function getPunter(roster: Player[]): Kicker {
  return toKicker(bestAtPosition(roster, "P", PUNTER_ATTRIBUTES));
}

/** Longest field goal this kicker will attempt, in yards. Power 72 gives ~60. */
export function fieldGoalRange(kicker: Kicker): number {
  return 30 + kicker.power * 0.42;
}

/** Furthest yards-to-goal the offense will try a field goal from. */
export function fieldGoalRangeFromScrimmage(kicker: Kicker): number {
  return Math.max(0, fieldGoalRange(kicker) - KICK_SNAP_DISTANCE);
}

/**
 * Make probability for a field goal. Falls off with distance as a share of
 * the kicker's range, then scales by accuracy — so a strong-legged kicker
 * extends range while an accurate one converts more of what he attempts.
 */
export function fieldGoalProbability(kicker: Kicker, yardsToGoal: number): number {
  const distance = yardsToGoal + KICK_SNAP_DISTANCE;
  const range = fieldGoalRange(kicker);
  if (distance > range) return 0.02;

  const shortestKick = 18;
  const stretch = Math.max(0, (distance - shortestKick) / Math.max(1, range - shortestKick));
  const base = 1 - stretch ** 2 * 0.72;
  const accuracyFactor = 0.8 + kicker.accuracy / 400;
  return Math.max(0.03, Math.min(0.985, base * accuracyFactor));
}

export function attemptFieldGoal(kicker: Kicker, yardsToGoal: number, rng: SeededRng): boolean {
  return rng.chance(fieldGoalProbability(kicker, yardsToGoal));
}

export function attemptExtraPoint(kicker: Kicker, rng: SeededRng): boolean {
  return rng.chance(Math.min(0.995, 0.9 + kicker.accuracy / 900));
}

/**
 * Net punt distance in yards. Returns how far the ball moves downfield from
 * the line of scrimmage, before touchback handling.
 */
export function puntDistance(punter: Kicker, rng: SeededRng): number {
  const mean = 40 + (punter.power - 70) * 0.22;
  const distance = rng.gaussian(mean, 6) + (punter.accuracy - 70) * 0.06;
  return Math.round(Math.max(20, Math.min(70, distance)));
}
