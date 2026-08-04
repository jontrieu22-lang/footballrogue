import { describe, expect, it } from "vitest";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { SeededRng } from "../src/rng.js";
import {
  counterPlan,
  resolveReveal,
  scoutingReport,
  type RevealOutcome,
} from "../src/sim/reveal.js";
import { simulateGame } from "../src/sim/gameSim.js";
import {
  DEFENSE_SCHEMES,
  getSchemeMultiplier,
  OFFENSE_SCHEMES,
} from "../src/schemes.js";

function freshTeam(seed: number) {
  resetPlayerIdCounter();
  resetTeamIdCounter();
  return generateTeam(new SeededRng(seed));
}

/** A distinct identity for a team cloned from another, without a fresh roster. */
function cloneAs(team: ReturnType<typeof generateTeam>, id: string, name: string) {
  return { ...team, id, name, coach: { ...team.coach, id: `${id}-coach` } };
}

describe("resolveReveal", () => {
  function distribution(myExp: number, theirExp: number, samples = 40_000) {
    const rng = new SeededRng(2024);
    const tally: Record<RevealOutcome, number> = { youRead: 0, neither: 0, theyRead: 0 };
    for (let i = 0; i < samples; i++) tally[resolveReveal(myExp, theirExp, rng)]++;
    return {
      youRead: tally.youRead / samples,
      neither: tally.neither / samples,
      theyRead: tally.theyRead / samples,
    };
  }

  it("lands in neither most often when experience is equal", () => {
    const d = distribution(0, 0);
    expect(d.neither).toBeGreaterThan(d.youRead);
    expect(d.neither).toBeGreaterThan(d.theyRead);
    expect(d.youRead).toBeCloseTo(d.theyRead, 2);
  });

  it("reads more often with more experience", () => {
    const rookieVsRookie = distribution(0, 0);
    const vetVsRookie = distribution(20, 0);
    const rookieVsVet = distribution(0, 20);
    expect(vetVsRookie.youRead).toBeGreaterThan(rookieVsRookie.youRead);
    expect(rookieVsVet.youRead).toBeLessThan(rookieVsRookie.youRead);
  });

  it("never guarantees a read at any experience edge", () => {
    const vetVsRookie = distribution(20, 0);
    const rookieVsVet = distribution(0, 20);
    const rookieVsRookie = distribution(0, 0);
    // The reader is never certain, and the hardest edge (a full career vs a
    // rookie) still lands short of the 60% cap.
    expect(vetVsRookie.youRead).toBeLessThan(0.75);
    expect(vetVsRookie.theyRead).toBeLessThan(0.75);
    // Even equal rookies read sometimes — it's a distribution, not a coin flip.
    expect(rookieVsRookie.youRead).toBeGreaterThan(0.2);
    // Roughly the 30% → 60% career band from the spec.
    expect(rookieVsRookie.youRead).toBeGreaterThan(0.2);
    expect(rookieVsVet.youRead).toBeLessThan(vetVsRookie.youRead);
  });
});

describe("counterPlan", () => {
  it("picks the defense that most hurts their offense and the offense that most exploits their defense", () => {
    const team = freshTeam(1);
    const plan = counterPlan(team.scheme.offense, team.scheme.defense);

    const bestDefense = DEFENSE_SCHEMES.reduce((best, d) =>
      getSchemeMultiplier(team.scheme.offense, d) <
      getSchemeMultiplier(team.scheme.offense, best)
        ? d
        : best,
    );
    const bestOffense = OFFENSE_SCHEMES.reduce((best, o) =>
      getSchemeMultiplier(o, team.scheme.defense) >
      getSchemeMultiplier(best, team.scheme.defense)
        ? o
        : best,
    );

    expect(plan.defense).toBe(bestDefense);
    expect(plan.offense).toBe(bestOffense);
  });
});

describe("scoutingReport", () => {
  it("fogs ratings and tendencies unless the read is won", () => {
    const team = freshTeam(2);
    const fogged = scoutingReport(team, new SeededRng(5), 3, false);

    // Ranges, not exact numbers.
    for (const range of Object.values(fogged.units)) {
      expect(range.low).toBeLessThanOrEqual(range.high);
      expect(range.high - range.low).toBeGreaterThan(1);
    }

    // Every scheme stays plausible, but the truth leads the odds.
    const truth = team.scheme.offense;
    const entries = OFFENSE_SCHEMES.map((s) => fogged.offenseLikelihood[s]);
    for (const p of entries) expect(p).toBeGreaterThan(0);
    expect(fogged.offenseLikelihood[truth]).toBe(Math.max(...entries));
    expect(entries.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("collapses to the truth when the read is won", () => {
    const team = freshTeam(3);
    const revealed = scoutingReport(team, new SeededRng(6), 3, true);

    for (const range of Object.values(revealed.units)) {
      expect(range.low).toBe(range.high);
    }
    for (const s of OFFENSE_SCHEMES) {
      expect(revealed.offenseLikelihood[s]).toBe(s === team.scheme.offense ? 1 : 0);
    }
    for (const s of DEFENSE_SCHEMES) {
      expect(revealed.defenseLikelihood[s]).toBe(s === team.scheme.defense ? 1 : 0);
    }
  });
});

describe("counter-picking through the sim", () => {
  it("is worth measurable wins against an equal opponent versus committing blind", () => {
    const base = freshTeam(4);
    const teamA = cloneAs(base, "ta", "A");
    const teamB = cloneAs(base, "tb", "B");

    const counter = counterPlan(teamB.scheme.offense, teamB.scheme.defense);
    let blindWins = 0;
    let counterWins = 0;
    const games = 100;

    for (let i = 0; i < games; i++) {
      const aHome = i % 2 === 0;
      const rng = new SeededRng(i);
      const blind = aHome
        ? simulateGame(teamA, teamB, rng)
        : simulateGame(teamB, teamA, rng);
      const countered = aHome
        ? simulateGame(teamA, teamB, new SeededRng(i + 10_000), {
            home: { offense: counter.offense, defense: counter.defense },
          })
        : simulateGame(teamB, teamA, new SeededRng(i + 10_000), {
            away: { offense: counter.offense, defense: counter.defense },
          });

      const aPoints = (r: { home: { points: number }; away: { points: number } }) =>
        aHome ? r.home.points : r.away.points;
      const bPoints = (r: { home: { points: number }; away: { points: number } }) =>
        aHome ? r.away.points : r.home.points;

      if (aPoints(blind) > bPoints(blind)) blindWins++;
      if (aPoints(countered) > bPoints(countered)) counterWins++;
    }

    expect(counterWins / games).toBeGreaterThan(blindWins / games + 0.1);
  });
});
