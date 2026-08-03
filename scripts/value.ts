/**
 * Positional value check: how many wins a season an elite player at each
 * position is worth, versus a league-average one.
 *
 * Reported per starter, because upgrading "all defensive linemen" replaces
 * four starters while "all quarterbacks" replaces one — the raw group number
 * flatters positions that field more bodies.
 *
 *   npm run value
 */
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import type { Position } from "../src/types.js";

const SEASONS = 30;
const ELITE_BIAS = 30;

/** How many players at each position are on the field at once. */
const STARTERS: Record<Position, number> = {
  QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1,
};

function averageWins(upgrade: Position | null): number {
  let wins = 0;
  for (let seed = 1; seed <= SEASONS; seed++) {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const league = generateLeague(new SeededRng(seed), 32);
    const team = league.teams[0]!;
    const rng = new SeededRng(seed * 104729);
    if (upgrade) {
      team.roster = team.roster.map((p) =>
        p.position === upgrade
          ? generatePlayer(p.position, rng, p.name, { qualityBias: ELITE_BIAS })
          : p,
      );
    }
    scheduleSeason(league, 17);
    simulateSeason(league, new SeededRng(seed * 7919));
    wins += team.record.wins;
  }
  return wins / SEASONS;
}

const baseline = averageWins(null);
const positions = Object.keys(STARTERS) as Position[];

const rows = positions
  .map((position) => {
    const groupGain = averageWins(position) - baseline;
    return { position, groupGain, perStarter: groupGain / STARTERS[position] };
  })
  .sort((a, b) => b.perStarter - a.perStarter);

console.log(`Baseline avg wins: ${baseline.toFixed(2)}  (${SEASONS} seasons per position)\n`);
console.log("Wins added per elite starter:");
for (const { position, groupGain, perStarter } of rows) {
  const bar = "#".repeat(Math.max(0, Math.round(perStarter * 10)));
  console.log(
    `  ${position.padEnd(3)} ${perStarter >= 0 ? "+" : ""}${perStarter.toFixed(2)}` +
      `  (whole group ${groupGain >= 0 ? "+" : ""}${groupGain.toFixed(2)} over ${STARTERS[position]}) ${bar}`,
  );
}

const best = rows[0];
const second = rows[1];
if (best && second) {
  console.log(
    `\nMost valuable position: ${best.position}, ` +
      `${(best.perStarter / Math.max(0.01, second.perStarter)).toFixed(1)}x the next (${second.position}).` +
      `\n[Quarterback should lead clearly — that is the position's real-world shape.]`,
  );
}
