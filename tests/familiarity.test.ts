import { describe, expect, it } from "vitest";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import {
  advanceFamiliarity,
  ALL_SCHEMES,
  FAMILIARITY_DECAY_PER_GAME,
  FAMILIARITY_FLOOR,
  FAMILIARITY_GAIN_PER_GAME,
  initialFamiliarity,
} from "../src/progression/familiarity.js";
import { applyMatchup } from "../src/sim/gameSim.js";
import type { TeamUnitRatings } from "../src/sim/units.js";
import { SeededRng } from "../src/rng.js";
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from "../src/schemes.js";

function freshTeam(seed: number) {
  resetPlayerIdCounter();
  resetTeamIdCounter();
  return generateTeam(new SeededRng(seed));
}

describe("initialFamiliarity", () => {
  it("starts the season schemes at full and everything else at the floor", () => {
    const offense = OFFENSE_SCHEMES[0]!;
    const defense = DEFENSE_SCHEMES[0]!;
    const familiarity = initialFamiliarity(offense, defense);

    expect(familiarity[offense]).toBe(1);
    expect(familiarity[defense]).toBe(1);
    for (const scheme of ALL_SCHEMES) {
      if (scheme === offense || scheme === defense) continue;
      expect(familiarity[scheme]).toBe(FAMILIARITY_FLOOR);
    }
  });

  it("covers every scheme id", () => {
    const team = freshTeam(1);
    for (const scheme of ALL_SCHEMES) {
      expect(team.familiarity[scheme]).toBeTypeOf("number");
    }
    expect(team.familiarity[team.scheme.offense]).toBe(1);
    expect(team.familiarity[team.scheme.defense]).toBe(1);
  });
});

describe("advanceFamiliarity", () => {
  it("raises what you run and decays what you neglect", () => {
    const team = freshTeam(2);
    const played = OFFENSE_SCHEMES.find((s) => s !== team.scheme.offense)!;
    const neglected = OFFENSE_SCHEMES.find((s) => s !== played)!;
    const beforePlayed = team.familiarity[played];
    const beforeNeglected = team.familiarity[neglected];

    advanceFamiliarity(team, played, team.scheme.defense);

    expect(team.familiarity[played]).toBeCloseTo(beforePlayed + FAMILIARITY_GAIN_PER_GAME);
    expect(team.familiarity[neglected]).toBeCloseTo(
      Math.max(FAMILIARITY_FLOOR, beforeNeglected - FAMILIARITY_DECAY_PER_GAME),
    );
  });

  it("clamps at 1 and at the floor", () => {
    const team = freshTeam(2);
    const offense = team.scheme.offense;
    const defense = team.scheme.defense;
    // Pump the base schemes far past 1; drag a floor scheme below the floor.
    for (let i = 0; i < 20; i++) advanceFamiliarity(team, offense, defense);
    expect(team.familiarity[offense]).toBe(1);
    expect(team.familiarity[defense]).toBe(1);

    const other = OFFENSE_SCHEMES.find((s) => s !== offense)!;
    for (let i = 0; i < 20; i++) advanceFamiliarity(team, other, defense);
    expect(team.familiarity[offense]).toBe(FAMILIARITY_FLOOR);
  });

  it("a fresh team learning a new scheme is fully fluent in ~5 games", () => {
    const team = freshTeam(2);
    const newcomer = OFFENSE_SCHEMES.find((s) => s !== team.scheme.offense)!;
    const gains = Math.ceil((1 - FAMILIARITY_FLOOR) / FAMILIARITY_GAIN_PER_GAME);
    for (let i = 0; i < gains; i++) advanceFamiliarity(team, newcomer, team.scheme.defense);
    expect(team.familiarity[newcomer]).toBe(1);
  });
});

describe("applyMatchup damping", () => {
  const units: TeamUnitRatings = {
    passOffense: 100,
    rushOffense: 90,
    passDefense: 80,
    rushDefense: 70,
  };

  it("reproduces the raw multiplier at full familiarity", () => {
    for (const raw of [0.9, 1.0, 1.08]) {
      const out = applyMatchup(units, raw, 1);
      expect(out.passOffense).toBeCloseTo(100 * raw);
      expect(out.rushOffense).toBeCloseTo(90 * raw);
      // Defense units are untouched by the matchup.
      expect(out.passDefense).toBe(80);
      expect(out.rushDefense).toBe(70);
    }
  });

  it("plays vanilla (multiplier 1) at zero familiarity", () => {
    for (const raw of [0.9, 1.08]) {
      const out = applyMatchup(units, raw, 0);
      expect(out.passOffense).toBe(100);
      expect(out.rushOffense).toBe(90);
    }
  });

  it("blends the edge linearly with familiarity in both directions", () => {
    // Advantage damped: half the exploit at 0.5 familiarity.
    expect(applyMatchup(units, 1.08, 0.5).passOffense).toBeCloseTo(100 * 1.04);
    // Disadvantage damped the same way: an unfamiliar offense is less
    // predictable, so the counter bites less.
    expect(applyMatchup(units, 0.9, 0.5).passOffense).toBeCloseTo(100 * 0.95);
  });
});
