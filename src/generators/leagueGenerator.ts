import type { League } from "../models/league.js";
import type { SeededRng } from "../rng.js";
import { generateTeam } from "./teamGenerator.js";

export function generateLeague(rng: SeededRng, numTeams = 32, season = 1): League {
  const teams = [];
  const usedNames = new Set<string>();

  while (teams.length < numTeams) {
    const team = generateTeam(rng);
    if (usedNames.has(team.name)) continue; // re-roll on name collision
    usedNames.add(team.name);
    teams.push(team);
  }

  return { season, teams, schedule: [] };
}
