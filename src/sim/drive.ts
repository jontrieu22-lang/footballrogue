import type { SeededRng } from "../rng.js";
import {
  expectedPoints,
  expectedPointsAfterTurnover,
  FIELD_GOAL_VALUE,
  SAFETY_VALUE,
  TOUCHDOWN_VALUE,
} from "./expectedPoints.js";
import {
  attemptExtraPoint,
  attemptFieldGoal,
  fieldGoalProbability,
  fieldGoalRangeFromScrimmage,
  puntDistance,
  type Kicker,
} from "./kicking.js";
import { resolvePlay, type PlayResult, type PlayType } from "./play.js";
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

/** A play plus what it was worth in expected points. */
export interface PlayRecord extends PlayResult {
  /** Expected points added for the offense. The defense is credited its negative. */
  epa: number;
}

export interface DriveResult {
  outcome: DriveOutcome;
  points: number;
  /** Where the opposing offense takes over, as their own yards-to-goal (1-99). */
  nextFieldPosition: number;
  playsRun: number;
  yardsGained: number;
  clockSeconds: number;
  plays: PlayRecord[];
  /** Total expected points added by the offense over the drive. */
  epa: number;
  /** EPA split by the play type that produced it, for crediting the right unit. */
  passEpa: number;
  rushEpa: number;
  /** EPA from field goal attempts, which belongs to the kicker rather than an offensive unit. */
  kickEpa: number;
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
 * out.
 *
 * Every play is valued in expected points — the offense banks what it gains
 * and the defense is credited the negative — so a drive's worth nets the two
 * against each other rather than counting yards.
 */
export function simulateDrive(context: DriveContext, rng: SeededRng): DriveResult {
  const plays: PlayRecord[] = [];
  let yardsToGoal = Math.max(1, Math.min(99, context.startingYardsToGoal));
  const startingYardsToGoal = yardsToGoal;
  let down = 1;
  let yardsToFirstDown = Math.min(10, yardsToGoal);
  let clockSeconds = 0;
  let passEpa = 0;
  let rushEpa = 0;
  let kickEpa = 0;

  const kickRange = fieldGoalRangeFromScrimmage(context.kicker);

  const creditEpa = (type: PlayType, epa: number): void => {
    if (type === "pass") passEpa += epa;
    else rushEpa += epa;
  };

  const finish = (
    outcome: DriveOutcome,
    points: number,
    nextFieldPosition: number,
  ): DriveResult => ({
    outcome,
    points,
    nextFieldPosition: Math.max(1, Math.min(99, nextFieldPosition)),
    playsRun: plays.length,
    yardsGained: startingYardsToGoal - yardsToGoal,
    clockSeconds,
    plays,
    epa: passEpa + rushEpa + kickEpa,
    passEpa,
    rushEpa,
    kickEpa,
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
      const decision = context.playCaller.callFourthDown(
        situation(),
        {
          fieldGoalRange: kickRange,
          fieldGoalProbability: fieldGoalProbability(context.kicker, yardsToGoal),
          expectedPuntDistance: 40 + (context.punter.power - 70) * 0.22,
        },
        rng,
      );

      if (decision.action === "fieldGoal") {
        clockSeconds += 6;
        // Kicking value belongs to neither the pass nor the run game, so it is
        // tracked separately rather than credited to an offensive unit.
        const valueBefore = expectedPoints(yardsToGoal, down, yardsToFirstDown);
        if (attemptFieldGoal(context.kicker, yardsToGoal, rng)) {
          kickEpa += FIELD_GOAL_VALUE - valueBefore;
          return finish("fieldGoal", 3, TOUCHBACK_YARDS_TO_GOAL);
        }
        const missSpot = flipField(Math.min(99, yardsToGoal + 8));
        kickEpa += expectedPointsAfterTurnover(missSpot) - valueBefore;
        return finish("missedFieldGoal", 0, missSpot);
      }

      if (decision.action === "punt") {
        clockSeconds += 14;
        const distance = puntDistance(context.punter, rng);
        const landing = yardsToGoal - distance;
        const nextPosition = landing <= 0 ? TOUCHBACK_YARDS_TO_GOAL : flipField(landing);
        return finish("punt", 0, nextPosition);
      }
      // "go" falls through and runs a normal play on fourth down.
    }

    const playType = context.playCaller.callPlay(situation(), rng);
    const play = resolvePlay(playType, context.offense, context.defense, rng);
    clockSeconds += play.clockSeconds;

    const valueBefore = expectedPoints(yardsToGoal, down, yardsToFirstDown);

    if (play.turnover) {
      const valueAfter = expectedPointsAfterTurnover(flipField(yardsToGoal));
      const epa = valueAfter - valueBefore;
      plays.push({ ...play, epa });
      creditEpa(playType, epa);
      return finish("turnover", 0, flipField(yardsToGoal));
    }

    yardsToGoal -= play.yards;

    if (yardsToGoal <= 0) {
      clockSeconds += 6;
      const epa = TOUCHDOWN_VALUE - valueBefore;
      plays.push({ ...play, epa });
      creditEpa(playType, epa);
      const points = 6 + (attemptExtraPoint(context.kicker, rng) ? 1 : 0);
      return finish("touchdown", points, TOUCHBACK_YARDS_TO_GOAL);
    }

    if (yardsToGoal >= 100) {
      const epa = SAFETY_VALUE - valueBefore;
      plays.push({ ...play, epa });
      creditEpa(playType, epa);
      return finish("safety", -2, TOUCHBACK_YARDS_TO_GOAL);
    }

    yardsToFirstDown -= play.yards;

    let nextDown = down;
    let nextDistance = yardsToFirstDown;
    let endedOnDowns = false;

    if (yardsToFirstDown <= 0) {
      nextDown = 1;
      nextDistance = Math.min(10, yardsToGoal);
    } else if (down === 4) {
      endedOnDowns = true;
    } else {
      nextDown = down + 1;
    }

    const valueAfter = endedOnDowns
      ? expectedPointsAfterTurnover(flipField(yardsToGoal))
      : expectedPoints(yardsToGoal, nextDown, nextDistance);
    const epa = valueAfter - valueBefore;
    plays.push({ ...play, epa });
    creditEpa(playType, epa);

    if (endedOnDowns) {
      return finish("downs", 0, flipField(yardsToGoal));
    }

    down = nextDown;
    yardsToFirstDown = nextDistance;
  }
}
