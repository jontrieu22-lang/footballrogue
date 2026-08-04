import type { League } from "../models/league.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { simulateGame, type GameResult } from "./gameSim.js";
import { generateSchedule } from "./schedule.js";
import { awardDevelopmentPoints } from "../progression/development.js";
import { developTeam } from "../progression/aiDevelopment.js";
import { advanceFamiliarity } from "../progression/familiarity.js";

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

export interface SimulateSeasonOptions {
  /**
   * Award development points from each game's expected points added. On by
   * default; turn it off to sim a season without progressing anyone.
   */
  awardDevelopment?: boolean;
  /**
   * Let AI teams spend their players' points as they earn them. Pass the id of
   * the human-controlled team to leave its points unspent for the player.
   */
  autoDevelopTeams?: boolean;
  humanTeamId?: string;
}

/** Plays out every game on `league.schedule` in order, mutating team records/points as it goes. */
export function simulateSeason(
  league: League,
  rng: SeededRng,
  options: SimulateSeasonOptions = {},
): SeasonSummary {
  const { awardDevelopment = true, autoDevelopTeams = true, humanTeamId } = options;
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

    // Teams gain fluency in what they actually ran and lose it in what they
    // neglected. The weekly plan (Step 6) overrides the scheme a team runs,
    // so the human's flow calls advanceFamiliarity with the played plan;
    // AI teams and full-season sims always play their season schemes.
    advanceFamiliarity(home, home.scheme.offense, home.scheme.defense);
    advanceFamiliarity(away, away.scheme.offense, away.scheme.defense);

    if (awardDevelopment) {
      awardDevelopmentPoints(home, result.home);
      awardDevelopmentPoints(away, result.away);
    }
  }

  if (autoDevelopTeams) {
    for (const team of league.teams) {
      if (team.id !== humanTeamId) developTeam(team);
    }
  }

  return { results };
}
