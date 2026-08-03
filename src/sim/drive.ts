import type { SeededRng } from "../rng.js";
import {
  attemptExtraPoint,
  attemptFieldGoal,
  fieldGoalRangeFromScrimmage,
  puntDistance,
  type Kicker,
} from "./kicking.js";
import { resolvePlay, type PlayResult } from "./play.js";
import type { GameSituation, PlayCaller } from "./playCalling.js";
import type { TeamUnitRatings } from "./units.js";
import type { OffenseSchemeId } from "../types.js";

export type DriveOutcome =
  | "touchdown"
  | "fieldGoal"
  | "missedFieldGoal"
  | "punt"
  | "turnover"
  | "downs"
  | "safety"
  | "endOfHalf";

export interface DriveResult {
  outcome: DriveOutcome;
  points: number;
  /** Where the opposing offense takes over, as their own yards-to-goal (1-99). */
  nextFieldPosition: number;
  playsRun: number;
  yardsGained: number;
  clockSeconds: number;
  plays: PlayResult[];
}

export interface DriveContext {
  offense: TeamUnitRatings;
  defense: TeamUnitRatings;
  scheme: OffenseSchemeId;
  playCaller: PlayCaller;
  kicker: Kicker;
  punter: Kicker;
  /** Offense's distance to the opponent's goal line at the start of the drive. */
  startingYardsToGoal: number;
  scoreDifferential: number;
  secondsRemaining: number;
}

const TOUCHBACK_YARDS_TO_GOAL = 75;

/** Flip a spot on the field to the other team's frame of reference. */
function flipField(yardsToGoal: number): number {
  return Math.max(1, Math.min(99, 100 - yardsToGoal));
}

/**
 * Plays out a single possession: downs, field position, and a fourth-down
 * decision, ending in a score, a change of possession, or the clock running
 * out. Field position is returned in the *next* offense's frame so drives can
 * be chained, which is what gives turnovers and punts real consequences.
 */
export function simulateDrive(context: DriveContext, rng: SeededRng): DriveResult {
  const plays: PlayResult[] = [];
  let yardsToGoal = Math.max(1, Math.min(99, context.startingYardsToGoal));
  const startingYardsToGoal = yardsToGoal;
  let down = 1;
  let yardsToFirstDown = Math.min(10, yardsToGoal);
  let clockSeconds = 0;
  const fieldGoalRange = fieldGoalRangeFromScrimmage(context.kicker);

  const finish = (outcome: DriveOutcome, points: number, nextFieldPosition: number): DriveResult => ({
    outcome,
    points,
    nextFieldPosition: Math.max(1, Math.min(99, nextFieldPosition)),
    playsRun: plays.length,
    yardsGained: startingYardsToGoal - yardsToGoal,
    clockSeconds,
    plays,
  });

  const situation = (): GameSituation => ({
    down,
    yardsToFirstDown,
    yardsToGoal,
    scoreDifferential: context.scoreDifferential,
    secondsRemaining: Math.max(0, context.secondsRemaining - clockSeconds),
    scheme: context.scheme,
  });

  while (true) {
    if (clockSeconds >= context.secondsRemaining) {
      return finish("endOfHalf", 0, TOUCHBACK_YARDS_TO_GOAL);
    }

    if (down === 4) {
      const decision = context.playCaller.callFourthDown(situation(), fieldGoalRange, rng);

      if (decision.action === "fieldGoal") {
        clockSeconds += 6;
        if (attemptFieldGoal(context.kicker, yardsToGoal, rng)) {
          return finish("fieldGoal", 3, TOUCHBACK_YARDS_TO_GOAL);
        }
        // A miss hands the opponent the ball at the spot of the kick.
        return finish("missedFieldGoal", 0, flipField(Math.min(99, yardsToGoal + 8)));
      }

      if (decision.action === "punt") {
        clockSeconds += 14;
        const distance = puntDistance(context.punter, rng);
        const landingYardsToGoal = yardsToGoal - distance;
        // Punted into the end zone -> touchback.
        const nextPosition = landingYardsToGoal <= 0 ? TOUCHBACK_YARDS_TO_GOAL : flipField(landingYardsToGoal);
        return finish("punt", 0, nextPosition);
      }
      // "go" falls through and runs a normal play on fourth down.
    }

    const playType = context.playCaller.callPlay(situation(), rng);
    const play = resolvePlay(playType, context.offense, context.defense, rng);
    plays.push(play);
    clockSeconds += play.clockSeconds;

    if (play.turnover) {
      return finish("turnover", 0, flipField(yardsToGoal));
    }

    yardsToGoal -= play.yards;

    if (yardsToGoal <= 0) {
      clockSeconds += 6;
      const points = 6 + (attemptExtraPoint(context.kicker, rng) ? 1 : 0);
      return finish("touchdown", points, TOUCHBACK_YARDS_TO_GOAL);
    }

    if (yardsToGoal >= 100) {
      // Tackled in his own end zone.
      return finish("safety", -2, TOUCHBACK_YARDS_TO_GOAL);
    }

    yardsToFirstDown -= play.yards;

    if (yardsToFirstDown <= 0) {
      down = 1;
      yardsToFirstDown = Math.min(10, yardsToGoal);
    } else if (down === 4) {
      // Went for it and came up short.
      return finish("downs", 0, flipField(yardsToGoal));
    } else {
      down += 1;
    }
  }
}
