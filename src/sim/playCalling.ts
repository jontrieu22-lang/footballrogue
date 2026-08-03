import type { SeededRng } from "../rng.js";
import type { OffenseSchemeId } from "../types.js";
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
  callFourthDown(situation: GameSituation, fieldGoalRange: number, rng: SeededRng): FourthDownDecision;
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

  callFourthDown(
    situation: GameSituation,
    fieldGoalRange: number,
    rng: SeededRng,
  ): FourthDownDecision {
    const { yardsToGoal, yardsToFirstDown, scoreDifferential, secondsRemaining } = situation;
    const inFieldGoalRange = yardsToGoal <= fieldGoalRange;
    const desperate = scoreDifferential < 0 && secondsRemaining <= LATE_GAME;

    // Down by more than a field goal late, three points don't change the game.
    if (desperate && scoreDifferential < -3 && yardsToGoal > 3) {
      if (!inFieldGoalRange || yardsToFirstDown <= 8) return { action: "go" };
    }

    // Short yardage: worth the down once past your own end of the field.
    if (yardsToFirstDown <= 1 && yardsToGoal <= 60 && rng.chance(0.7)) return { action: "go" };
    if (yardsToFirstDown <= 2 && yardsToGoal <= 50 && rng.chance(0.55)) return { action: "go" };

    // No man's land: too far to kick, too close for a punt to gain much.
    if (!inFieldGoalRange && yardsToGoal <= 55 && yardsToFirstDown <= 4 && rng.chance(0.45)) {
      return { action: "go" };
    }

    if (inFieldGoalRange) return { action: "fieldGoal" };
    if (yardsToFirstDown <= 3 && rng.chance(0.3)) return { action: "go" };
    return { action: "punt" };
  }
}
