/**
 * Shows a player earning development points over a season and spending them.
 *
 *   npm run develop          # the team's quarterback
 *   npm run develop -- CB    # any position
 */
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { computeOverall } from "../src/models/player.js";
import { renderPlayerCard } from "../src/models/playerCard.js";
import { developPlayer } from "../src/progression/aiDevelopment.js";
import { SeededRng } from "../src/rng.js";
import { schemeForPosition } from "../src/schemes.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeTeamUnits } from "../src/sim/units.js";
import type { Position } from "../src/types.js";

const position = (process.argv[2]?.toUpperCase() ?? "QB") as Position;

resetPlayerIdCounter();
resetTeamIdCounter();
const rng = new SeededRng(2026);
const league = generateLeague(rng, 32);
const team = league.teams[0];
if (!team) throw new Error("league generated no teams");

scheduleSeason(league, 17);
// Nobody on this team spends automatically, so we can watch it happen.
simulateSeason(league, rng, { humanTeamId: team.id });

const candidates = team.roster
  .filter((p) => p.position === position)
  .sort((a, b) => b.developmentPoints - a.developmentPoints);
const player = candidates[0];
if (!player) throw new Error(`no ${position} on the roster`);

const scheme = schemeForPosition(player.position, team.scheme);
const unitsBefore = computeTeamUnits(team);
const overallBefore = computeOverall(player);

console.log(`${team.name} — ${player.name} after one 17-game season\n`);
console.log(renderPlayerCard(player, scheme));

developPlayer(player, scheme);

const unitsAfter = computeTeamUnits(team);
console.log(`\nAfter spending his development points:\n`);
console.log(renderPlayerCard(player, scheme));

console.log(`\nOverall: ${overallBefore} -> ${computeOverall(player)}`);
const unitName = ["QB", "RB", "WR", "TE", "OL"].includes(position) ? "offense" : "defense";
if (unitName === "offense") {
  console.log(
    `Team pass offense: ${unitsBefore.passOffense.toFixed(1)} -> ${unitsAfter.passOffense.toFixed(1)}` +
      `   rush offense: ${unitsBefore.rushOffense.toFixed(1)} -> ${unitsAfter.rushOffense.toFixed(1)}`,
  );
} else {
  console.log(
    `Team pass defense: ${unitsBefore.passDefense.toFixed(1)} -> ${unitsAfter.passDefense.toFixed(1)}` +
      `   rush defense: ${unitsBefore.rushDefense.toFixed(1)} -> ${unitsAfter.rushDefense.toFixed(1)}`,
  );
}
