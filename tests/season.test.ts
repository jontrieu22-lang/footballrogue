import { describe, expect, it } from "vitest";
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeDraftOrder, computeStandings } from "../src/sim/standings.js";

describe("season simulation", () => {
  it("gives every team a full 17-game record with no games lost", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(2024);
    const league = generateLeague(rng, 8);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    for (const team of league.teams) {
      const gamesPlayed = team.record.wins + team.record.losses + team.record.ties;
      expect(gamesPlayed).toBe(17);
    }
  });

  it("standings and draft order are exact reverses of each other", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(77);
    const league = generateLeague(rng, 8);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    const standings = computeStandings(league.teams);
    const draftOrder = computeDraftOrder(league.teams);
    expect(draftOrder).toEqual([...standings].reverse());
  });

  it("throws if simulated before a schedule exists", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(3);
    const league = generateLeague(rng, 4);
    expect(() => simulateSeason(league, rng)).toThrow();
  });
});
