import type { ScheduledGame } from "../models/league.js";

/**
 * Round-robin "circle method" pairing: for n teams (n must be even here,
 * odd counts get a bye slot), produces n-1 rounds where every team plays
 * every other team exactly once.
 */
function circleMethodRounds(teamIds: string[]): Array<Array<[string, string]>> {
  const ids: (string | null)[] = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(null); // bye

  const n = ids.length;
  const rounds: Array<Array<[string, string]>> = [];
  const rotating = ids.slice(1); // ids[0] stays fixed, the rest rotate

  for (let round = 0; round < n - 1; round++) {
    const arranged = [ids[0], ...rotating];
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arranged[i];
      const b = arranged[n - 1 - i];
      if (a !== null && a !== undefined && b !== null && b !== undefined) {
        pairs.push([a, b]);
      }
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop() as string | null);
  }

  return rounds;
}

/**
 * Builds a `totalWeeks`-long schedule for the given team ids. If
 * `totalWeeks` exceeds a full round-robin (n-1 weeks), rounds repeat with
 * home/away swapped to keep something roughly balanced rather than
 * generating a true 17-of-32 NFL-style partial schedule (a good future
 * refinement, not needed for the MVP sim).
 */
export function generateSchedule(teamIds: string[], totalWeeks: number): ScheduledGame[] {
  if (teamIds.length < 2) return [];

  const rounds = circleMethodRounds(teamIds);
  const schedule: ScheduledGame[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const cycle = Math.floor((week - 1) / rounds.length);
    const roundIndex = (week - 1) % rounds.length;
    const flipHomeAway = cycle % 2 === 1;

    for (const [teamA, teamB] of rounds[roundIndex] ?? []) {
      const [home, away] = flipHomeAway ? [teamB, teamA] : [teamA, teamB];
      schedule.push({ week, homeTeamId: home, awayTeamId: away });
    }
  }

  return schedule;
}
