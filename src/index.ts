import { generateLeague } from "./generators/leagueGenerator.js";
import { SeededRng } from "./rng.js";
import { SCHEME_LABELS } from "./schemes.js";
import { computeDraftOrder, computeStandings } from "./sim/standings.js";
import { scheduleSeason, simulateSeason } from "./sim/season.js";
import type { GameResult, TeamGameStats } from "./sim/gameSim.js";

const seed = Number(process.argv[2] ?? Date.now());
const numTeams = Number(process.argv[3] ?? 32);
const weeks = Number(process.argv[4] ?? 17);

const rng = new SeededRng(seed);
const league = generateLeague(rng, numTeams);
scheduleSeason(league, weeks);
const { results } = simulateSeason(league, rng);

const nameById = new Map(league.teams.map((t) => [t.id, t.name]));

console.log(`Football Rogue — Season ${league.season} (seed=${seed}, teams=${numTeams}, weeks=${weeks})\n`);

function boxScore(result: GameResult): string {
  const line = (label: string, home: number, away: number) =>
    `  ${label.padEnd(16)} ${String(home).padStart(5)} ${String(away).padStart(7)}`;

  const totals = (s: TeamGameStats) => s.passYards + s.rushYards;
  const home = result.home;
  const away = result.away;

  return [
    `  ${"".padEnd(16)} ${"HOME".padStart(5)} ${"AWAY".padStart(7)}`,
    line("Points", home.points, away.points),
    line("Total yards", totals(home), totals(away)),
    line("Pass yards", home.passYards, away.passYards),
    line("Rush yards", home.rushYards, away.rushYards),
    line("Drives", home.drives, away.drives),
    line("Plays", home.playsRun, away.playsRun),
    line("Turnovers", home.turnovers, away.turnovers),
    line("Sacks allowed", home.sacksAllowed, away.sacksAllowed),
    line("Time of poss (s)", home.timeOfPossession, away.timeOfPossession),
  ].join("\n");
}

const sample = results[0];
if (sample) {
  const homeName = nameById.get(sample.homeTeamId) ?? sample.homeTeamId;
  const awayName = nameById.get(sample.awayTeamId) ?? sample.awayTeamId;
  const overtime = sample.overtimePeriods > 0 ? `  (${sample.overtimePeriods} OT)` : "";
  console.log(`Week 1 box score — ${awayName} at ${homeName}${overtime}`);
  console.log(boxScore(sample));
  console.log();
}

console.log("Final Standings:");
computeStandings(league.teams).forEach((row, i) => {
  const team = league.teams.find((t) => t.id === row.teamId);
  const schemes = team
    ? `  ${SCHEME_LABELS[team.scheme.offense]} / ${SCHEME_LABELS[team.scheme.defense]}`
    : "";
  console.log(
    `${String(i + 1).padStart(2)}. ${row.teamName.padEnd(22)} ${row.wins}-${row.losses}-${row.ties}  ` +
      `PF ${String(row.pointsFor).padStart(3)} PA ${String(row.pointsAgainst).padStart(3)} ` +
      `(${row.pointDiff >= 0 ? "+" : ""}${row.pointDiff})${schemes}`,
  );
});

console.log("\nDraft Order (worst record picks first):");
computeDraftOrder(league.teams)
  .slice(0, 10)
  .forEach((row, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${row.teamName} (${row.wins}-${row.losses}-${row.ties})`);
  });
console.log(`    ... ${Math.max(0, numTeams - 10)} more`);
