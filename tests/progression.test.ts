import { describe, expect, it } from "vitest";
import {
  GENERAL_ATTRIBUTES,
  positionalAttributesFor,
  type AttributeKey,
} from "../src/models/attributes.js";
import { computeOverall, getAttribute, getBaseAttribute } from "../src/models/player.js";
import { allNodesFor, getSkillNode, SKILL_TREES, TIER_COSTS } from "../src/models/skillTree.js";
import {
  availableNodes,
  canUnlock,
  highestUnlockedTier,
  nextTierChoices,
  unlockNode,
} from "../src/progression/skills.js";
import { awardDevelopmentPoints } from "../src/progression/development.js";
import { developTeam } from "../src/progression/aiDevelopment.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeTeamUnits } from "../src/sim/units.js";
import {
  conversionProbability,
  expectedPoints,
  expectedPointsAfterTurnover,
} from "../src/sim/expectedPoints.js";
import type { Position } from "../src/types.js";
import type { TeamGameStats } from "../src/sim/gameSim.js";

const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];

describe("expected points", () => {
  it("rises as the offense gets closer to the end zone", () => {
    let previous = -Infinity;
    for (const yardsToGoal of [95, 80, 60, 40, 20, 5, 1]) {
      const value = expectedPoints(yardsToGoal);
      expect(value, `${yardsToGoal} to goal`).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("is negative backed up against your own goal line", () => {
    expect(expectedPoints(97)).toBeLessThan(0);
    expect(expectedPoints(5)).toBeGreaterThan(4);
  });

  it("falls on later downs and longer distances", () => {
    expect(expectedPoints(50, 3, 10)).toBeLessThan(expectedPoints(50, 1, 10));
    expect(expectedPoints(50, 2, 18)).toBeLessThan(expectedPoints(50, 2, 3));
  });

  it("treats a turnover as the negative of the opponent's position", () => {
    // Handing the opponent the ball on their own 1 is good for us.
    expect(expectedPointsAfterTurnover(99)).toBeGreaterThan(0);
    // Handing it over on our 1 is very bad.
    expect(expectedPointsAfterTurnover(1)).toBeLessThan(-4);
  });

  it("makes short fourth downs easier to convert than long ones", () => {
    expect(conversionProbability(1)).toBeGreaterThan(conversionProbability(10));
  });
});

describe("skill tree definitions", () => {
  it("only modifies attributes the position actually has", () => {
    for (const position of ALL_POSITIONS) {
      const available = new Set<AttributeKey>([
        ...GENERAL_ATTRIBUTES,
        ...positionalAttributesFor(position),
      ]);
      for (const node of allNodesFor(position)) {
        for (const key of Object.keys(node.modifiers) as AttributeKey[]) {
          expect(available.has(key), `${node.id} modifies unavailable ${key}`).toBe(true);
        }
      }
    }
  });

  it("gives every node a unique id and the cost of its tier", () => {
    const seen = new Set<string>();
    for (const position of ALL_POSITIONS) {
      for (const node of allNodesFor(position)) {
        expect(seen.has(node.id), `duplicate node id ${node.id}`).toBe(false);
        seen.add(node.id);
        expect(node.cost).toBe(TIER_COSTS[node.tier - 1]);
      }
    }
  });

  it("offers a real choice at every tier", () => {
    for (const position of ALL_POSITIONS) {
      const tree = SKILL_TREES[position];
      expect(tree.length, `${position} tiers`).toBe(TIER_COSTS.length);
      tree.forEach((tier, index) => {
        expect(tier.length, `${position} tier ${index + 1}`).toBeGreaterThanOrEqual(2);
        for (const node of tier) expect(node.tier).toBe(index + 1);
      });
    }
  });
});

describe("unlock rules", () => {
  function freshPlayer(position: Position = "WR", points = 10_000) {
    resetPlayerIdCounter();
    const player = generatePlayer(position, new SeededRng(5), "Prospect");
    player.developmentPoints = points;
    return player;
  }

  it("refuses a node from another position's tree", () => {
    const receiver = freshPlayer("WR");
    expect(canUnlock(receiver, "OL_t1_quickSet")).toEqual({ ok: false, reason: "wrong-position" });
  });

  it("refuses an unknown node", () => {
    expect(canUnlock(freshPlayer(), "not_a_node")).toEqual({ ok: false, reason: "unknown-node" });
  });

  it("refuses a higher tier before the one below it is taken", () => {
    const receiver = freshPlayer();
    expect(canUnlock(receiver, "WR_t2_zoneBeater")).toEqual({ ok: false, reason: "tier-locked" });
    expect(unlockNode(receiver, "WR_t1_crispRoutes").ok).toBe(true);
    expect(canUnlock(receiver, "WR_t2_zoneBeater").ok).toBe(true);
  });

  it("allows only one node per tier", () => {
    const receiver = freshPlayer();
    expect(unlockNode(receiver, "WR_t1_crispRoutes").ok).toBe(true);
    expect(canUnlock(receiver, "WR_t1_burner")).toEqual({ ok: false, reason: "tier-already-taken" });
  });

  it("refuses a node the player cannot afford, and does not charge for it", () => {
    const receiver = freshPlayer("WR", 10);
    expect(canUnlock(receiver, "WR_t1_burner")).toEqual({ ok: false, reason: "insufficient-points" });
    expect(unlockNode(receiver, "WR_t1_burner").ok).toBe(false);
    expect(receiver.developmentPoints).toBe(10);
    expect(receiver.unlockedNodeIds).toHaveLength(0);
  });

  it("charges the cost and records the node once unlocked", () => {
    const receiver = freshPlayer("WR", 500);
    const node = getSkillNode("WR_t1_burner");
    expect(node).toBeDefined();
    expect(unlockNode(receiver, "WR_t1_burner").ok).toBe(true);
    expect(receiver.developmentPoints).toBe(500 - (node?.cost ?? 0));
    expect(receiver.unlockedNodeIds).toEqual(["WR_t1_burner"]);
    expect(highestUnlockedTier(receiver)).toBe(1);
    expect(canUnlock(receiver, "WR_t1_burner")).toEqual({ ok: false, reason: "already-unlocked" });
  });

  it("reports the choices available at the next tier", () => {
    const receiver = freshPlayer("WR", 500);
    expect(nextTierChoices(receiver).every((n) => n.tier === 1)).toBe(true);
    unlockNode(receiver, "WR_t1_burner");
    expect(nextTierChoices(receiver).every((n) => n.tier === 2)).toBe(true);
    expect(availableNodes(receiver).every((n) => n.tier === 2)).toBe(true);
  });
});

describe("unlocked nodes reach the sim", () => {
  it("raises the attribute it names without touching the base value", () => {
    resetPlayerIdCounter();
    const receiver = generatePlayer("WR", new SeededRng(9), "Developed");
    receiver.developmentPoints = 500;
    const baseBefore = getBaseAttribute(receiver, "speed");
    const before = getAttribute(receiver, "speed") ?? 0;

    unlockNode(receiver, "WR_t1_burner"); // +7 speed, +4 acceleration

    expect(getBaseAttribute(receiver, "speed")).toBe(baseBefore);
    expect(getAttribute(receiver, "speed")).toBeGreaterThan(before);
    expect(receiver.skillBonuses.speed).toBe(7);
  });

  it("never pushes an attribute past 99", () => {
    resetPlayerIdCounter();
    const receiver = generatePlayer("WR", new SeededRng(9), "Maxed");
    receiver.general.speed = 98;
    receiver.developmentPoints = 5000;
    unlockNode(receiver, "WR_t1_burner");
    expect(getAttribute(receiver, "speed")).toBe(99);
  });

  it("raises the player's overall rating", () => {
    resetPlayerIdCounter();
    const receiver = generatePlayer("WR", new SeededRng(12), "Improving");
    receiver.developmentPoints = 5000;
    const before = computeOverall(receiver);
    unlockNode(receiver, "WR_t1_crispRoutes");
    unlockNode(receiver, "WR_t2_zoneBeater");
    unlockNode(receiver, "WR_t3_routeTechnician");
    expect(computeOverall(receiver)).toBeGreaterThan(before);
  });

  it("raises the team unit rating the node belongs to", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const team = generateTeam(new SeededRng(14));
    const before = computeTeamUnits(team).passOffense;

    for (const player of team.roster) {
      if (player.position !== "QB") continue;
      player.developmentPoints = 5000;
      unlockNode(player, "QB_t1_cannon");
      unlockNode(player, "QB_t2_deepTouch");
    }

    expect(computeTeamUnits(team).passOffense).toBeGreaterThan(before);
  });
});

describe("earning development points", () => {
  function statsWith(overrides: Partial<TeamGameStats>): TeamGameStats {
    return {
      points: 0, touchdowns: 0, fieldGoals: 0, turnovers: 0, drives: 10,
      playsRun: 60, passYards: 240, rushYards: 110, sacksAllowed: 2,
      timeOfPossession: 1800, passEpa: 7, rushEpa: 3, kickEpa: 0.5,
      passDefenseEpa: -7, rushDefenseEpa: -3,
      ...overrides,
    };
  }

  it("pays starters more than bench players", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const team = generateTeam(new SeededRng(21));
    awardDevelopmentPoints(team, statsWith({}));

    const quarterbacks = team.roster
      .filter((p) => p.position === "QB")
      .sort((a, b) => b.developmentPoints - a.developmentPoints);
    const starter = quarterbacks[0];
    const backup = quarterbacks[1];
    expect(starter).toBeDefined();
    expect(backup).toBeDefined();
    expect(starter?.developmentPoints ?? 0).toBeGreaterThan(backup?.developmentPoints ?? 0);
    // Bench players still develop, just slowly.
    expect(backup?.developmentPoints ?? 0).toBeGreaterThan(0);
  });

  it("pays a defense for expected points it denied, not for counting stats", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const stingy = generateTeam(new SeededRng(22));
    const leaky = generateTeam(new SeededRng(22));

    // Identical rosters; the only difference is how much the opposing offense
    // was allowed to gain. Stored already-negated, so -1 beats -12.
    awardDevelopmentPoints(stingy, statsWith({ passDefenseEpa: -1 }));
    awardDevelopmentPoints(leaky, statsWith({ passDefenseEpa: -12 }));

    const cornerPoints = (team: typeof stingy) =>
      team.roster
        .filter((p) => p.position === "CB")
        .reduce((sum, p) => sum + p.developmentPoints, 0);

    expect(cornerPoints(stingy)).toBeGreaterThan(cornerPoints(leaky));
  });

  it("pays an offense more for a bigger expected points gain", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const explosive = generateTeam(new SeededRng(23));
    const stalling = generateTeam(new SeededRng(23));

    awardDevelopmentPoints(explosive, statsWith({ passEpa: 18 }));
    awardDevelopmentPoints(stalling, statsWith({ passEpa: -2 }));

    const quarterback = (team: typeof explosive) =>
      Math.max(...team.roster.filter((p) => p.position === "QB").map((p) => p.developmentPoints));

    expect(quarterback(explosive)).toBeGreaterThan(quarterback(stalling));
  });

  it("earns enough over a season to reach the first tier", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(24);
    const league = generateLeague(rng, 8);
    scheduleSeason(league, 17);
    simulateSeason(league, rng, { autoDevelopTeams: false });

    const team = league.teams[0];
    expect(team).toBeDefined();
    const best = Math.max(...(team?.roster ?? []).map((p) => p.developmentPoints));
    expect(best).toBeGreaterThan(TIER_COSTS[0] ?? 0);
  });
});

describe("development pays off", () => {
  it("wins more games than leaving the points unspent", () => {
    const run = (spend: boolean) => {
      let wins = 0;
      // 24 seasons: with development worth ~1.5 wins and per-season win
      // variance of about 2.5, a smaller sample cannot reliably resolve the
      // edge — 8 seasons measured spend and hoard as a coin flip.
      const seasons = 24;
      for (let seed = 1; seed <= seasons; seed++) {
        resetPlayerIdCounter();
        resetTeamIdCounter();
        const league = generateLeague(new SeededRng(seed), 32);
        const team = league.teams[0];
        if (!team) continue;
        scheduleSeason(league, 17);
        simulateSeason(league, new SeededRng(seed * 7919), { humanTeamId: team.id });
        if (spend) developTeam(team);
        for (const other of league.teams) other.record = { wins: 0, losses: 0, ties: 0 };
        simulateSeason(league, new SeededRng(seed * 7919), { humanTeamId: team.id });
        wins += team.record.wins;
      }
      return wins / seasons;
    };

    expect(run(true)).toBeGreaterThan(run(false));
  });

  it("lets AI teams develop toward what their scheme asks for", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const zoneTeam = generateTeam(new SeededRng(31));
    zoneTeam.scheme.defense = "cover2Zone";
    const manTeam = generateTeam(new SeededRng(31));
    manTeam.scheme.defense = "blitzMan";

    for (const team of [zoneTeam, manTeam]) {
      for (const player of team.roster) player.developmentPoints = 400;
      developTeam(team);
    }

    const cornerBonus = (team: typeof zoneTeam, key: "zoneCoverage" | "manCoverage") =>
      team.roster
        .filter((p) => p.position === "CB")
        .reduce((sum, p) => sum + (p.skillBonuses[key] ?? 0), 0);

    expect(cornerBonus(zoneTeam, "zoneCoverage")).toBeGreaterThan(cornerBonus(manTeam, "zoneCoverage"));
    expect(cornerBonus(manTeam, "manCoverage")).toBeGreaterThan(cornerBonus(zoneTeam, "manCoverage"));
  });
});
