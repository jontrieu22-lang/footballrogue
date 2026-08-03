/**
 * Balance smoke test: simulates many seasons and reports aggregate numbers
 * against real-NFL reference values. Unit tests prove the sim is *correct*;
 * this proves it's *plausible*. Re-run after touching any sim constant.
 *
 *   npm run sanity
 */
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeStandings } from "../src/sim/standings.js";

const SEASONS = 20;

const scores: number[] = [];
const winTotals: number[] = [];

for (let seed = 1; seed <= SEASONS; seed++) {
  const rng = new SeededRng(seed);
  const league = generateLeague(rng, 32);
  scheduleSeason(league, 17);
  const { results } = simulateSeason(league, rng);
  for (const result of results) scores.push(result.home.points, result.away.points);
  for (const row of computeStandings(league.teams)) winTotals.push(row.wins);
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const sorted = [...scores].sort((a, b) => a - b);
const percentile = (p: number) => sorted[Math.floor(sorted.length * p)];

console.log(`Seasons simulated:     ${SEASONS}`);
console.log(`Games simulated:       ${scores.length / 2}`);
console.log(`Avg points/team/game:  ${average(scores).toFixed(1)}   [NFL reference: ~22]`);
console.log(`Score range:           ${sorted[0]} - ${sorted[sorted.length - 1]}`);
console.log(`Score p10/p50/p90:     ${percentile(0.1)} / ${percentile(0.5)} / ${percentile(0.9)}`);
console.log(`Best / worst win total:${Math.max(...winTotals)} / ${Math.min(...winTotals)}   [NFL: ~15 / ~2]`);
console.log(`Avg wins per team:     ${average(winTotals).toFixed(2)}   [must be ~8.5 for a 17-game season]`);
