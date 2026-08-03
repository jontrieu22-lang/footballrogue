/**
 * Balance smoke test: simulates many seasons and reports aggregate numbers
 * against real-NFL reference values. Unit tests prove the sim is *correct*;
 * this proves it's *plausible*. Re-run after touching any sim constant.
 *
 *   npm run sanity
 */
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { computeTeamUnits } from "../src/sim/units.js";
import { developTeam } from "../src/progression/aiDevelopment.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import type { Position } from "../src/types.js";

const SEASONS = 20;

const scores: number[] = [];
const winTotals: number[] = [];
const ratings: number[] = [];
let tiedGames = 0;
let totalGames = 0;

for (let seed = 1; seed <= SEASONS; seed++) {
  resetPlayerIdCounter();
  resetTeamIdCounter();
  const rng = new SeededRng(seed);
  const league = generateLeague(rng, 32);
  scheduleSeason(league, 17);
  const { results } = simulateSeason(league, rng);
  for (const result of results) {
    scores.push(result.home.points, result.away.points);
    totalGames++;
    if (result.home.points === result.away.points) tiedGames++;
  }
  // Push both from the same iteration so rating and wins stay paired per team.
  for (const team of league.teams) {
    winTotals.push(team.record.wins);
    const units = computeTeamUnits(team);
    ratings.push(
      units.passOffense + units.rushOffense + units.passDefense + units.rushDefense,
    );
  }
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const sorted = [...scores].sort((a, b) => a - b);
const percentile = (p: number) => sorted[Math.floor(sorted.length * p)];

function correlation(xs: number[], ys: number[]): number {
  const mx = average(xs);
  const my = average(ys);
  const cov = average(xs.map((x, i) => (x - mx) * ((ys[i] ?? 0) - my)));
  const sd = (values: number[]) => {
    const m = average(values);
    return Math.sqrt(average(values.map((v) => (v - m) ** 2)));
  };
  return cov / (sd(xs) * sd(ys));
}

/**
 * Wins gained by building a whole roster for its schemes versus against them.
 * If this drifts toward zero, roster construction has stopped mattering.
 */
function schemeFitValue(): number {
  const FITS: Partial<Record<Position, string>> = {
    RB: "powerBack", TE: "blockingTE", OL: "roadGrader", WR: "possession",
    CB: "zoneCorner", S: "freeSafety", LB: "thumper", DL: "runStopper",
  };
  const FIGHTS: Partial<Record<Position, string>> = {
    RB: "receivingBack", TE: "receivingTE", OL: "passProtector", WR: "deepThreat",
    CB: "manCorner", S: "strongSafety", LB: "blitzer", DL: "speedRusher",
  };

  const run = (plan: Partial<Record<Position, string>>) => {
    let wins = 0;
    for (let seed = 1; seed <= SEASONS; seed++) {
      resetPlayerIdCounter();
      resetTeamIdCounter();
      const league = generateLeague(new SeededRng(seed), 32);
      const team = league.teams[0]!;
      team.scheme = { offense: "powerRun", defense: "cover2Zone" };
      const rng = new SeededRng(seed * 104729);
      team.roster = team.roster.map((p) => {
        const archetypeId = plan[p.position];
        return archetypeId ? generatePlayer(p.position, rng, p.name, { archetypeId }) : p;
      });
      scheduleSeason(league, 17);
      simulateSeason(league, new SeededRng(seed * 7919));
      wins += team.record.wins;
    }
    return wins / SEASONS;
  };

  return run(FITS) - run(FIGHTS);
}

/**
 * Wins gained by spending a season's development points versus hoarding them.
 * If this reaches zero, the skill trees have stopped mattering.
 */
function developmentValue(): number {
  const run = (spend: boolean) => {
    let wins = 0;
    for (let seed = 1; seed <= SEASONS; seed++) {
      resetPlayerIdCounter();
      resetTeamIdCounter();
      const league = generateLeague(new SeededRng(seed), 32);
      const team = league.teams[0]!;
      scheduleSeason(league, 17);
      simulateSeason(league, new SeededRng(seed * 7919), { humanTeamId: team.id });
      if (spend) developTeam(team);
      for (const other of league.teams) other.record = { wins: 0, losses: 0, ties: 0 };
      simulateSeason(league, new SeededRng(seed * 7919), { humanTeamId: team.id });
      wins += team.record.wins;
    }
    return wins / SEASONS;
  };
  return run(true) - run(false);
}

console.log(`Seasons simulated:     ${SEASONS}`);
console.log(`Games simulated:       ${scores.length / 2}`);
console.log(`Avg points/team/game:  ${average(scores).toFixed(1)}   [NFL reference: ~22]`);
console.log(`Score range:           ${sorted[0]} - ${sorted[sorted.length - 1]}`);
console.log(`Score p10/p50/p90:     ${percentile(0.1)} / ${percentile(0.5)} / ${percentile(0.9)}`);
console.log(`Best / worst win total:${Math.max(...winTotals)} / ${Math.min(...winTotals)}   [NFL: ~15 / ~2]`);
console.log(`Avg wins per team:     ${average(winTotals).toFixed(2)}   [must be ~8.5 for a 17-game season]`);
console.log(`Tied games:            ${((100 * tiedGames) / totalGames).toFixed(2)}%   [NFL reference: ~0.4%]`);

console.log(`\nDo decisions matter?`);
console.log(`Roster quality spread:  sd ${Math.sqrt(average(ratings.map((r) => (r - average(ratings)) ** 2))).toFixed(2)} on mean ${average(ratings).toFixed(1)}`);
console.log(`Corr(rating, wins):     ${correlation(ratings, winTotals).toFixed(3)}   [NFL reference: ~0.6-0.7]`);
console.log(`Scheme fit worth:       ${schemeFitValue().toFixed(2)} wins/season   [target: ~2]`);
console.log(`Development worth:      ${developmentValue().toFixed(2)} wins/season   [target: ~1.5]`);
