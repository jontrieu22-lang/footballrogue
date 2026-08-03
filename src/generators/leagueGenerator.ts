import type { League } from "../models/league.js";
import type { SeededRng } from "../rng.js";
import { generateTeam } from "./teamGenerator.js";

/**
 * Spread of franchise quality across the league. Without this every team is
 * drawn from the same distribution and, once 50-odd players are averaged into
 * unit ratings, they all converge on the same strength — so wins become noise
 * and building a better roster stops paying. Contenders and rebuilds have to
 * actually exist.
 */
const TEAM_QUALITY_STD_DEV = 2.6;
const TEAM_QUALITY_LIMIT = 7;

/**
 * How lopsided a team is between offense and defense. Real rosters are rarely
 * balanced, and it gives the draft something to correct.
 */
const UNIT_TILT_STD_DEV = 2;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

export function generateLeague(rng: SeededRng, numTeams = 32, season = 1): League {
  const teams = [];
  const usedNames = new Set<string>();

  while (teams.length < numTeams) {
    const quality = clamp(rng.gaussian(0, TEAM_QUALITY_STD_DEV), TEAM_QUALITY_LIMIT);
    const tilt = clamp(rng.gaussian(0, UNIT_TILT_STD_DEV), UNIT_TILT_STD_DEV * 2);

    const team = generateTeam(rng, {
      qualityBias: quality,
      offenseBias: tilt,
      defenseBias: -tilt,
    });

    if (usedNames.has(team.name)) continue; // re-roll on name collision
    usedNames.add(team.name);
    teams.push(team);
  }

  return { season, teams, schedule: [] };
}
