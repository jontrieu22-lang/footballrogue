import type { SeededRng } from "../rng.js";
import type { OffenseSchemeId } from "../types.js";
import {
  conversionProbability,
  expectedPoints,
  expectedPointsAfterTurnover,
  FIELD_GOAL_VALUE,
} from "./expectedPoints.js";
import type { PlayType } from "./play.js";

/** Everything a play caller knows when deciding what to run. */
export interface GameSituation {
  down: number;
  yardsToFirstDown: number;
  /** Distance to the opponent's goal line, 1-99. */
  yardsToGoal: number;
  /** Own score minus opponent's. */
  scoreDifferential: number;
  secondsRemaining: number;
  scheme: OffenseSchemeId;
}

export interface FourthDownDecision {
  action: "go" | "fieldGoal" | "punt";
}

/**
 * Decides what a team does with the ball. The AI implementation drives every
 * team today; the interface exists so a human-controlled team can be swapped
 * in without touching the drive engine.
 */
export interface PlayCaller {
  callPlay(situation: GameSituation, rng: SeededRng): PlayType;
  callFourthDown(situation: GameSituation, options: FourthDownOptions, rng: SeededRng): FourthDownDecision;
}

export interface FourthDownOptions {
  /** Furthest yards-to-goal this kicker will attempt from. */
  fieldGoalRange: number;
  /** Probability the kicker converts from the current spot. */
  fieldGoalProbability: number;
  /** Expected net punt distance in yards. */
  expectedPuntDistance: number;
}

/** Baseline pass rate per offensive scheme, before situational adjustment. */
const SCHEME_PASS_RATE: Record<OffenseSchemeId, number> = {
  powerRun: 0.42,
  airRaid: 0.68,
  westCoast: 0.6,
  rpo: 0.53,
};

const TWO_MINUTE_WARNING = 120;
const LATE_GAME = 300;

/**
 * Scheme sets the baseline tendency; situation moves it. Trailing late forces
 * the ball into the air, leading late bleeds clock on the ground, and short
 * yardage leans run — which is what makes a run-heavy scheme shorten games.
 */
export class AiPlayCaller implements PlayCaller {
  callPlay(situation: GameSituation, rng: SeededRng): PlayType {
    let passRate = SCHEME_PASS_RATE[situation.scheme];

    if (situation.down === 3) {
      if (situation.yardsToFirstDown >= 6) passRate += 0.25;
      else if (situation.yardsToFirstDown <= 2) passRate -= 0.2;
    }
    if (situation.yardsToFirstDown <= 2) passRate -= 0.12;
    if (situation.yardsToFirstDown >= 10) passRate += 0.1;

    // Goal-line offense leans on the run.
    if (situation.yardsToGoal <= 3) passRate -= 0.15;

    if (situation.secondsRemaining <= LATE_GAME) {
      if (situation.scoreDifferential < 0) {
        passRate += situation.secondsRemaining <= TWO_MINUTE_WARNING ? 0.35 : 0.18;
      } else if (situation.scoreDifferential > 0) {
        passRate -= situation.secondsRemaining <= TWO_MINUTE_WARNING ? 0.3 : 0.15;
      }
    }

    return rng.chance(Math.max(0.05, Math.min(0.95, passRate))) ? "pass" : "run";
  }

  /**
   * Compares the three options by expected points rather than by rules of
   * thumb: kicking is worth the make probability times three, less what the
   * opponent gains on a miss; going for it is worth a converted first down
   * weighted against handing over the ball at the spot.
   */
  callFourthDown(
    situation: GameSituation,
    options: FourthDownOptions,
    rng: SeededRng,
  ): FourthDownDecision {
    const { yardsToGoal, yardsToFirstDown, scoreDifferential, secondsRemaining } = situation;

    const goValue = (() => {
      const convert = conversionProbability(yardsToFirstDown);
      const gained = expectedPoints(Math.max(1, yardsToGoal - yardsToFirstDown), 1, 10);
      const failed = expectedPointsAfterTurnover(Math.max(1, 100 - yardsToGoal));
      return convert * gained + (1 - convert) * failed;
    })();

    const fieldGoalValue = (() => {
      if (yardsToGoal > options.fieldGoalRange) return -Infinity;
      const make = options.fieldGoalProbability;
      // A miss gives the opponent the ball at the spot of the kick.
      const missed = expectedPointsAfterTurnover(Math.max(1, 100 - (yardsToGoal + 8)));
      return make * FIELD_GOAL_VALUE + (1 - make) * missed;
    })();

    const puntValue = (() => {
      const landing = yardsToGoal - options.expectedPuntDistance;
      const opponentYardsToGoal = landing <= 0 ? 75 : Math.max(1, 100 - landing);
      return expectedPointsAfterTurnover(opponentYardsToGoal);
    })();

    // Trailing late, a field goal that leaves you behind is worth little, and
    // the clock makes a punt close to worthless.
    const desperate = scoreDifferential < 0 && secondsRemaining <= LATE_GAME;
    const adjustedFieldGoal =
      desperate && scoreDifferential < -3 ? fieldGoalValue - 2.5 : fieldGoalValue;
    const adjustedPunt = desperate ? puntValue - (secondsRemaining <= TWO_MINUTE_WARNING ? 5 : 1.5) : puntValue;

    // Real coaches are markedly more conservative than pure expected points:
    // a failed fourth down is visible and blamed in a way a punt never is.
    // Without this penalty teams convert far too often and touchdown rates run
    // half again as high as the NFL's.
    const goBias = rng.float(-1.35, 0.15);
    const adjustedGo = goValue + goBias;

    if (adjustedGo >= adjustedFieldGoal && adjustedGo >= adjustedPunt) return { action: "go" };
    if (adjustedFieldGoal >= adjustedPunt) return { action: "fieldGoal" };
    return { action: "punt" };
  }
}
