import { describe, expect, it } from "vitest";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
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

  it("builds every point from touchdowns, extra points and field goals", () => {
    const { home, away } = freshTeams(2);
    const rng = new SeededRng(42);

    for (let i = 0; i < 60; i++) {
      const result = simulateGame(home, away, rng);
      for (const side of [result.home, result.away]) {
        const floor = side.touchdowns * 6 + side.fieldGoals * 3;
        // Upper bound allows a made extra point per touchdown, plus safeties,
        // which score for this team while being recorded on the opponent's drive.
        const ceiling = side.touchdowns * 7 + side.fieldGoals * 3 + 8;
        expect(side.points).toBeGreaterThanOrEqual(floor);
        expect(side.points).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("produces a plausible number of drives and plays instead of a fixed count", () => {
    const { home, away } = freshTeams(3);
    const rng = new SeededRng(9);
    const driveCounts = new Set<number>();

    for (let i = 0; i < 40; i++) {
      const result = simulateGame(home, away, rng);
      for (const side of [result.home, result.away]) {
        driveCounts.add(side.drives);
        expect(side.drives).toBeGreaterThan(4);
        expect(side.drives).toBeLessThan(20);
        expect(side.playsRun).toBeGreaterThan(30);
        expect(side.playsRun).toBeLessThan(110);
        expect(side.timeOfPossession).toBeGreaterThan(0);
      }
    }

    // Possession count emerges from play, so it must vary between games.
    expect(driveCounts.size).toBeGreaterThan(1);
  });

  it("lets a far better roster beat a far worse one nearly every time", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(31);
    const strong = generateTeam(rng);
    const weak = generateTeam(rng);
    strong.roster = strong.roster.map((p) =>
      generatePlayer(p.position, rng, p.name, { qualityBias: 22 }),
    );
    weak.roster = weak.roster.map((p) =>
      generatePlayer(p.position, rng, p.name, { qualityBias: -22 }),
    );

    let strongWins = 0;
    const games = 100;
    for (let i = 0; i < games; i++) {
      const result = simulateGame(strong, weak, new SeededRng(i));
      if (result.home.points > result.away.points) strongWins++;
    }

    expect(strongWins / games).toBeGreaterThan(0.9);
  });

  it("only goes to overtime when regulation ends level", () => {
    const { home, away } = freshTeams(4);
    let sawOvertime = false;

    for (let seed = 0; seed < 200; seed++) {
      const result = simulateGame(home, away, new SeededRng(seed));
      if (result.overtimePeriods > 0) sawOvertime = true;
      expect(result.overtimePeriods).toBeLessThanOrEqual(3);
    }

    expect(sawOvertime).toBe(true);
  });

  it("only ends in a tie after exhausting every overtime period", () => {
    const { home, away } = freshTeams(5);
    for (let seed = 0; seed < 200; seed++) {
      const result = simulateGame(home, away, new SeededRng(seed));
      if (result.home.points === result.away.points) {
        expect(result.overtimePeriods).toBe(3);
      }
    }
  });
});
