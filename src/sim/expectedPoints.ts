/**
 * Expected points: how many points the *next score* in the game is worth to
 * the team currently holding the ball, given where they have it.
 *
 * This is the value layer underneath the scoreboard. Points on the board
 * still come from real touchdowns and field goals, but every play moves
 * expected points, and the difference — EPA — is what a play was actually
 * worth. Defense earns the negative of what the offense gains, so a unit's
 * contribution nets out exactly as it should.
 */

/**
 * Expected points on 1st & 10, by distance to the opponent's goal line.
 * Anchored to real NFL values: a team backed up to its own goal line is
 * worth *negative* points because the opponent is more likely to score next.
 */
const EXPECTED_POINTS_BY_FIELD_POSITION: ReadonlyArray<readonly [yardsToGoal: number, points: number]> = [
  [1, 6.0],
  [5, 5.4],
  [10, 4.7],
  [20, 3.9],
  [30, 3.2],
  [40, 2.6],
  [50, 2.0],
  [60, 1.4],
  [70, 0.9],
  [80, 0.4],
  [90, -0.2],
  [99, -0.7],
];

/** Value lost by being on a later down, before accounting for distance. */
const DOWN_PENALTY: readonly number[] = [0, 0, 0.45, 1.15, 1.8];

const YARDS_TO_GO_PENALTY = 0.045;

function interpolate(yardsToGoal: number): number {
  const table = EXPECTED_POINTS_BY_FIELD_POSITION;
  const clamped = Math.max(1, Math.min(99, yardsToGoal));

  const firstEntry = table[0];
  const lastEntry = table[table.length - 1];
  if (!firstEntry || !lastEntry) return 0;
  if (clamped <= firstEntry[0]) return firstEntry[1];
  if (clamped >= lastEntry[0]) return lastEntry[1];

  for (let i = 1; i < table.length; i++) {
    const previous = table[i - 1];
    const current = table[i];
    if (!previous || !current) continue;
    if (clamped <= current[0]) {
      const span = current[0] - previous[0];
      const ratio = span === 0 ? 0 : (clamped - previous[0]) / span;
      return previous[1] + (current[1] - previous[1]) * ratio;
    }
  }
  return lastEntry[1];
}

/**
 * Expected points for an offense with the ball at `yardsToGoal`, on the given
 * down needing `yardsToFirstDown`.
 */
export function expectedPoints(yardsToGoal: number, down = 1, yardsToFirstDown = 10): number {
  const base = interpolate(yardsToGoal);
  const downPenalty = DOWN_PENALTY[Math.max(1, Math.min(4, down))] ?? 0;
  const distancePenalty = (yardsToFirstDown - 10) * YARDS_TO_GO_PENALTY;
  return base - downPenalty - distancePenalty;
}

/**
 * Expected points from the *current* offense's point of view after the other
 * team takes over at `opponentYardsToGoal`. Their gain is this offense's loss,
 * so the value is negated.
 */
export function expectedPointsAfterTurnover(opponentYardsToGoal: number): number {
  return -expectedPoints(opponentYardsToGoal, 1, 10);
}

/** Points banked by a touchdown plus the near-certain extra point. */
export const TOUCHDOWN_VALUE = 6.95;
export const FIELD_GOAL_VALUE = 3;
export const SAFETY_VALUE = -2;

/**
 * Rough probability of converting a fourth down of this distance, used by the
 * play caller to compare going for it against kicking.
 */
export function conversionProbability(yardsToFirstDown: number): number {
  return Math.max(0.2, Math.min(0.78, 0.75 - 0.045 * yardsToFirstDown));
}
