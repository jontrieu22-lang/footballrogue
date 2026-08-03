import { generateLeague } from "./generators/leagueGenerator.js";
import { SeededRng } from "./rng.js";
import { computeDraftOrder, computeStandings } from "./sim/standings.js";
import { scheduleSeason, simulateSeason } from "./sim/season.js";

const seed = Number(process.argv[2] ?? Date.now());
const numTeams = Number(process.argv[3] ?? 32);
const weeks = Number(process.argv[4] ?? 17);

const rng = new SeededRng(seed);
const league = generateLeague(rng, numTeams);
scheduleSeason(league, weeks);
simulateSeason(league, rng);

console.log(`Football Rogue — Season ${league.season} demo (seed=${seed}, teams=${numTeams}, weeks=${weeks})\n`);

console.log("Final Standings:");
computeStandings(league.teams).forEach((row, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${row.teamName.padEnd(22)} ${row.wins}-${row.losses}-${row.ties}  ` +
      `PF ${row.pointsFor} PA ${row.pointsAgainst} (diff ${row.pointDiff >= 0 ? "+" : ""}${row.pointDiff})`,
  );
});

console.log("\nDraft Order (worst record picks first):");
computeDraftOrder(league.teams).forEach((row, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${row.teamName} (${row.wins}-${row.losses}-${row.ties})`);
});
