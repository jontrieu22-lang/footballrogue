import { describe, expect, it } from "vitest";
import {
  DEFENSE_POSITIONS,
  DEFENSE_SCHEMES,
  OFFENSE_POSITIONS,
  OFFENSE_SCHEMES,
  SCHEME_EMPHASIS,
  emphasisLevelFor,
  schemeForPosition,
  schemeWeightFor,
  type SchemeId,
} from "../src/schemes.js";
import {
  GENERAL_ATTRIBUTES,
  positionalAttributesFor,
  type AttributeKey,
} from "../src/models/attributes.js";
import { computeOverall } from "../src/models/player.js";
import { computeDefenseRating, computeOffenseRating } from "../src/models/team.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { SeededRng } from "../src/rng.js";
import type { Position } from "../src/types.js";

const ALL_SCHEMES = Object.keys(SCHEME_EMPHASIS) as SchemeId[];

function attributesAvailableTo(positions: readonly Position[]): Set<AttributeKey> {
  const available = new Set<AttributeKey>(GENERAL_ATTRIBUTES);
  for (const position of positions) {
    for (const key of positionalAttributesFor(position)) available.add(key);
  }
  return available;
}

describe("scheme emphasis definitions", () => {
  it("never puts the same attribute in two emphasis buckets", () => {
    for (const scheme of ALL_SCHEMES) {
      const { core, support, deEmphasis } = SCHEME_EMPHASIS[scheme];
      const all = [...core, ...support, ...deEmphasis];
      expect(new Set(all).size, `${scheme} has a duplicated attribute`).toBe(all.length);
    }
  });

  it("only emphasizes attributes that exist on its own side of the ball", () => {
    const offenseAttributes = attributesAvailableTo(OFFENSE_POSITIONS);
    const defenseAttributes = attributesAvailableTo(DEFENSE_POSITIONS);

    for (const scheme of OFFENSE_SCHEMES) {
      const { core, support, deEmphasis } = SCHEME_EMPHASIS[scheme];
      for (const key of [...core, ...support, ...deEmphasis]) {
        expect(offenseAttributes.has(key), `offense scheme ${scheme} references ${key}`).toBe(true);
      }
    }
    for (const scheme of DEFENSE_SCHEMES) {
      const { core, support, deEmphasis } = SCHEME_EMPHASIS[scheme];
      for (const key of [...core, ...support, ...deEmphasis]) {
        expect(defenseAttributes.has(key), `defense scheme ${scheme} references ${key}`).toBe(true);
      }
    }
  });

  it("weights core above support above neutral above de-emphasized", () => {
    for (const scheme of ALL_SCHEMES) {
      const { core, support, deEmphasis } = SCHEME_EMPHASIS[scheme];
      const coreKey = core[0];
      const deKey = deEmphasis[0];
      if (coreKey) expect(schemeWeightFor(scheme, coreKey)).toBeGreaterThan(1);
      if (deKey) expect(schemeWeightFor(scheme, deKey)).toBeLessThan(1);
      for (const key of support) {
        expect(schemeWeightFor(scheme, key)).toBeGreaterThan(1);
        if (coreKey) expect(schemeWeightFor(scheme, key)).toBeLessThan(schemeWeightFor(scheme, coreKey));
      }
    }
  });

  it("routes each position to the right side's scheme", () => {
    const schemes = { offense: "powerRun", defense: "cover2Zone" } as const;
    expect(schemeForPosition("QB", schemes)).toBe("powerRun");
    expect(schemeForPosition("OL", schemes)).toBe("powerRun");
    expect(schemeForPosition("CB", schemes)).toBe("cover2Zone");
    expect(schemeForPosition("DL", schemes)).toBe("cover2Zone");
    expect(schemeForPosition("K", schemes)).toBeUndefined();
  });

  it("reports emphasis levels that match the definitions", () => {
    expect(emphasisLevelFor("cover2Zone", "zoneCoverage")).toBe("core");
    expect(emphasisLevelFor("cover2Zone", "manCoverage")).toBe("deEmphasis");
    expect(emphasisLevelFor("cover2Zone", "awareness")).toBe("support");
    expect(emphasisLevelFor("cover2Zone", "speed")).toBe("neutral");
  });
});

describe("scheme fit", () => {
  it("leaves the true rating untouched and never mutates the player", () => {
    resetPlayerIdCounter();
    const rng = new SeededRng(3);
    const player = generatePlayer("CB", rng, "Immutable", { archetypeId: "zoneCorner" });
    const before = JSON.stringify(player);
    const trueOverall = computeOverall(player);

    computeOverall(player, "cover2Zone");
    computeOverall(player, "blitzMan");

    expect(JSON.stringify(player), "scheme rating mutated the player").toBe(before);
    expect(computeOverall(player)).toBe(trueOverall);
  });

  it("rates a zone corner above a man corner in zone, and reverses it in man", () => {
    resetPlayerIdCounter();
    const rng = new SeededRng(4242);
    const samples = 200;
    let zoneInZone = 0, manInZone = 0, zoneInMan = 0, manInMan = 0;

    for (let i = 0; i < samples; i++) {
      const zoneCorner = generatePlayer("CB", rng, "Zone", { archetypeId: "zoneCorner" });
      const manCorner = generatePlayer("CB", rng, "Man", { archetypeId: "manCorner" });
      zoneInZone += computeOverall(zoneCorner, "cover2Zone");
      manInZone += computeOverall(manCorner, "cover2Zone");
      zoneInMan += computeOverall(zoneCorner, "blitzMan");
      manInMan += computeOverall(manCorner, "blitzMan");
    }

    expect(zoneInZone / samples, "zone corner should win in Cover-2").toBeGreaterThan(manInZone / samples);
    expect(manInMan / samples, "man corner should win in Blitz Man").toBeGreaterThan(zoneInMan / samples);
  });

  it("rates a road grader above a pass protector in a run scheme, and reverses it in Air Raid", () => {
    resetPlayerIdCounter();
    const rng = new SeededRng(99);
    const samples = 200;
    let graderRun = 0, protectorRun = 0, graderAir = 0, protectorAir = 0;

    for (let i = 0; i < samples; i++) {
      const grader = generatePlayer("OL", rng, "Grader", { archetypeId: "roadGrader" });
      const protector = generatePlayer("OL", rng, "Protector", { archetypeId: "passProtector" });
      graderRun += computeOverall(grader, "powerRun");
      protectorRun += computeOverall(protector, "powerRun");
      graderAir += computeOverall(grader, "airRaid");
      protectorAir += computeOverall(protector, "airRaid");
    }

    expect(graderRun / samples).toBeGreaterThan(protectorRun / samples);
    expect(protectorAir / samples).toBeGreaterThan(graderAir / samples);
  });

  it("rates a team higher when its roster fits its own scheme", () => {
    const buildSecondary = (archetypeId: string) => {
      resetPlayerIdCounter();
      resetTeamIdCounter();
      const rng = new SeededRng(77);
      const team = generateTeam(rng);
      team.scheme.defense = "cover2Zone";
      team.roster = team.roster.map((p) =>
        p.position === "CB" ? generatePlayer("CB", rng, p.name, { archetypeId }) : p,
      );
      return computeDefenseRating(team);
    };

    expect(buildSecondary("zoneCorner")).toBeGreaterThan(buildSecondary("manCorner"));
  });

  it("rates offense through the offensive scheme only", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(21);
    const team = generateTeam(rng);
    team.scheme = { offense: "powerRun", defense: "cover2Zone" };
    const runOffense = computeOffenseRating(team);

    team.scheme = { offense: "airRaid", defense: "cover2Zone" };
    const airOffense = computeOffenseRating(team);

    // Same roster, same defensive scheme -> only the offensive change moves it.
    expect(runOffense).not.toBe(airOffense);
    expect(computeDefenseRating(team)).toBe(
      computeDefenseRating({ ...team, scheme: { offense: "rpo", defense: "cover2Zone" } }),
    );
  });
});
