import type { League } from "../models/league.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { simulateGame, type GameResult } from "./gameSim.js";
import { computeStandings } from "./standings.js";

/** Teams that make the postseason. The top seeds sit out the first round. */
export const PLAYOFF_TEAMS = 12;
const FIRST_ROUND_BYES = 4;

export interface PlayoffGame {
  round: number;
  roundName: string;
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: number;
  awaySeed: number;
  result: GameResult;
  winnerId: string;
}

export interface PlayoffResult {
  seeds: { teamId: string; teamName: string; seed: number }[];
  games: PlayoffGame[];
  championId: string;
  championName: string;
  runnerUpId: string;
}

function roundName(teamsRemaining: number): string {
  if (teamsRemaining <= 2) return "Final";
  if (teamsRemaining <= 4) return "Semifinal";
  if (teamsRemaining <= 8) return "Quarterfinal";
  return "Wild Card";
}

/**
 * Single elimination, reseeded each round so the best remaining team always
 * draws the worst. The higher seed hosts, which is worth real points given
 * home advantage in the sim.
 */
export function simulatePlayoffs(league: League, rng: SeededRng): PlayoffResult {
  const standings = computeStandings(league.teams);
  const teamsById = new Map(league.teams.map((team) => [team.id, team]));

  const qualified = standings.slice(0, Math.min(PLAYOFF_TEAMS, standings.length));
  if (qualified.length < 2) {
    throw new Error("Not enough teams to hold a postseason");
  }

  const seeds = qualified.map((row, index) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    seed: index + 1,
  }));
  const seedOf = new Map(seeds.map((s) => [s.teamId, s.seed]));

  const games: PlayoffGame[] = [];
  // Byes only apply while there are enough teams for them to mean anything.
  const byes = qualified.length > FIRST_ROUND_BYES ? Math.min(FIRST_ROUND_BYES, qualified.length - 2) : 0;
  let alive = seeds.map((s) => s.teamId);
  let round = 1;

  while (alive.length > 1) {
    // Reseed: best remaining first.
    alive.sort((a, b) => (seedOf.get(a) ?? 99) - (seedOf.get(b) ?? 99));

    const resting = round === 1 ? alive.slice(0, byes) : [];
    const playing = round === 1 ? alive.slice(byes) : alive;

    const winners: string[] = [...resting];
    const name = roundName(playing.length + resting.length);

    for (let i = 0; i < Math.floor(playing.length / 2); i++) {
      const homeId = playing[i];
      const awayId = playing[playing.length - 1 - i];
      if (!homeId || !awayId) continue;

      const home = teamsById.get(homeId);
      const away = teamsById.get(awayId);
      if (!home || !away) continue;

      const result = playGame(home, away, rng);
      const winnerId = result.home.points >= result.away.points ? homeId : awayId;

      games.push({
        round,
        roundName: name,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeSeed: seedOf.get(homeId) ?? 0,
        awaySeed: seedOf.get(awayId) ?? 0,
        result,
        winnerId,
      });
      winners.push(winnerId);
    }

    // An odd team out advances rather than being dropped.
    if (playing.length % 2 === 1) {
      const oddOneOut = playing[Math.floor(playing.length / 2)];
      if (oddOneOut) winners.push(oddOneOut);
    }

    alive = winners;
    round++;
  }

  const championId = alive[0] ?? "";
  const finalGame = games[games.length - 1];
  const runnerUpId = finalGame
    ? finalGame.winnerId === finalGame.homeTeamId
      ? finalGame.awayTeamId
      : finalGame.homeTeamId
    : "";

  return {
    seeds,
    games,
    championId,
    championName: teamsById.get(championId)?.name ?? "",
    runnerUpId,
  };
}

/**
 * Playoff games cannot end level, so overtime keeps going until somebody wins.
 * The regular-season sim allows a tie after three periods.
 */
function playGame(home: Team, away: Team, rng: SeededRng): GameResult {
  let result = simulateGame(home, away, rng);
  let attempts = 0;
  while (result.home.points === result.away.points && attempts < 20) {
    result = simulateGame(home, away, rng);
    attempts++;
  }
  return result;
}
