import type { League } from "../models/league.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { simulateGame, type GameResult } from "./gameSim.js";
import { generateSchedule } from "./schedule.js";

export function scheduleSeason(league: League, totalWeeks: number): void {
  league.schedule = generateSchedule(
    league.teams.map((t) => t.id),
    totalWeeks,
  );
}

function applyResult(home: Team, away: Team, result: GameResult): void {
  home.pointsFor += result.home.points;
  home.pointsAgainst += result.away.points;
  away.pointsFor += result.away.points;
  away.pointsAgainst += result.home.points;

  if (result.home.points > result.away.points) {
    home.record.wins += 1;
    away.record.losses += 1;
  } else if (result.home.points < result.away.points) {
    away.record.wins += 1;
    home.record.losses += 1;
  } else {
    home.record.ties += 1;
    away.record.ties += 1;
  }
}

export interface SeasonSummary {
  results: GameResult[];
}

/** Plays out every game on `league.schedule` in order, mutating team records/points as it goes. */
export function simulateSeason(league: League, rng: SeededRng): SeasonSummary {
  if (league.schedule.length === 0) {
    throw new Error("League has no schedule — call scheduleSeason() first.");
  }

  const teamsById = new Map(league.teams.map((team) => [team.id, team]));
  const results: GameResult[] = [];

  for (const game of league.schedule) {
    const home = teamsById.get(game.homeTeamId);
    const away = teamsById.get(game.awayTeamId);
    if (!home || !away) {
      throw new Error(`Scheduled game references unknown team: ${game.homeTeamId} vs ${game.awayTeamId}`);
    }
    const result = simulateGame(home, away, rng);
    results.push(result);
    applyResult(home, away, result);
  }

  return { results };
}
