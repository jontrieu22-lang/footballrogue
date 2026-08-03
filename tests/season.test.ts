import { describe, expect, it } from "vitest";
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeDraftOrder, computeStandings } from "../src/sim/standings.js";
import { computeTeamUnits } from "../src/sim/units.js";

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

  it("generates franchises that genuinely differ in quality", () => {
    // If every team is identical, wins become noise and roster building
    // stops paying off — see DESIGN.md §5.3.
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const league = generateLeague(new SeededRng(404), 32);
    const ratings = league.teams.map((team) => {
      const units = computeTeamUnits(team);
      return units.passOffense + units.rushOffense + units.passDefense + units.rushDefense;
    });

    const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const stdDev = Math.sqrt(
      ratings.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratings.length,
    );

    expect(stdDev).toBeGreaterThan(4);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeGreaterThan(20);
  });

  it("lets better rosters win more games across a season", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(505);
    const league = generateLeague(rng, 32);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    const ranked = league.teams
      .map((team) => {
        const units = computeTeamUnits(team);
        const rating = units.passOffense + units.rushOffense + units.passDefense + units.rushDefense;
        return { rating, wins: team.record.wins };
      })
      .sort((a, b) => b.rating - a.rating);

    const topQuarter = ranked.slice(0, 8);
    const bottomQuarter = ranked.slice(-8);
    const averageWins = (rows: typeof ranked) =>
      rows.reduce((sum, r) => sum + r.wins, 0) / rows.length;

    expect(averageWins(topQuarter)).toBeGreaterThan(averageWins(bottomQuarter) + 2);
  });

  it("throws if simulated before a schedule exists", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(3);
    const league = generateLeague(rng, 4);
    expect(() => simulateSeason(league, rng)).toThrow();
  });
});
