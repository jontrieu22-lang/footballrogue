import { describe, expect, it } from "vitest";
import { generateSchedule } from "../src/sim/schedule.js";

describe("generateSchedule", () => {
  it("gives every team exactly one game per week", () => {
    const teamIds = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);
    const schedule = generateSchedule(teamIds, 7); // full round robin for n=8 is 7 weeks

    const byWeek = new Map<number, string[]>();
    for (const game of schedule) {
      const teams = byWeek.get(game.week) ?? [];
      teams.push(game.homeTeamId, game.awayTeamId);
      byWeek.set(game.week, teams);
    }

    expect(byWeek.size).toBe(7);
    for (const teams of byWeek.values()) {
      expect(new Set(teams).size).toBe(teamIds.length);
      expect(teams.length).toBe(teamIds.length);
    }
  });

  it("has every team play every other team exactly once in a full round robin", () => {
    const teamIds = Array.from({ length: 6 }, (_, i) => `t${i + 1}`);
    const schedule = generateSchedule(teamIds, 5); // n-1 weeks

    const matchupCounts = new Map<string, number>();
    for (const game of schedule) {
      const key = [game.homeTeamId, game.awayTeamId].sort().join("-");
      matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);
    }

    expect(matchupCounts.size).toBe((teamIds.length * (teamIds.length - 1)) / 2);
    for (const count of matchupCounts.values()) {
      expect(count).toBe(1);
    }
  });

  it("supports more weeks than a single round robin by cycling", () => {
    const teamIds = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);
    const schedule = generateSchedule(teamIds, 17);
    const weeks = new Set(schedule.map((g) => g.week));
    expect(weeks.size).toBe(17);
    // 8 teams -> 4 games/week -> 68 total games over 17 weeks
    expect(schedule.length).toBe(17 * 4);
  });

  it("handles an odd number of teams via a bye", () => {
    const teamIds = Array.from({ length: 5 }, (_, i) => `t${i + 1}`);
    const schedule = generateSchedule(teamIds, 5);
    for (const week of new Set(schedule.map((g) => g.week))) {
      const teamsThisWeek = schedule
        .filter((g) => g.week === week)
        .flatMap((g) => [g.homeTeamId, g.awayTeamId]);
      expect(teamsThisWeek.length).toBeLessThanOrEqual(4); // at most 2 games, one team on bye
      expect(new Set(teamsThisWeek).size).toBe(teamsThisWeek.length);
    }
  });
});
