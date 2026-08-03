import { describe, expect, it } from "vitest";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { simulateGame } from "../src/sim/gameSim.js";
import { SeededRng } from "../src/rng.js";

function freshTeams(seed: number) {
  resetPlayerIdCounter();
  resetTeamIdCounter();
  const rng = new SeededRng(seed);
  const home = generateTeam(rng);
  const away = generateTeam(rng);
  return { home, away };
}

describe("simulateGame", () => {
  it("is deterministic given the same teams and rng seed", () => {
    const { home, away } = freshTeams(1);
    const resultA = simulateGame(home, away, new SeededRng(555));
    const resultB = simulateGame(home, away, new SeededRng(555));
    expect(resultA).toEqual(resultB);
  });

  it("produces non-negative scores that are multiples of 3 or built from 3s/7s", () => {
    const { home, away } = freshTeams(2);
    const rng = new SeededRng(42);
    const result = simulateGame(home, away, rng);
    expect(result.home.points).toBeGreaterThanOrEqual(0);
    expect(result.away.points).toBeGreaterThanOrEqual(0);
    expect(result.home.points).toBe(result.home.touchdowns * 7 + result.home.fieldGoals * 3);
    expect(result.away.points).toBe(result.away.touchdowns * 7 + result.away.fieldGoals * 3);
  });

  it("tracks exactly 12 drives per team", () => {
    const { home, away } = freshTeams(3);
    const result = simulateGame(home, away, new SeededRng(9));
    expect(result.home.drives).toBe(12);
    expect(result.away.drives).toBe(12);
  });
});
