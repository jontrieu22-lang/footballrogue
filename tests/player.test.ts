import { describe, expect, it } from "vitest";
import { computeOverall, getAttribute } from "../src/models/player.js";
import {
  GENERAL_ATTRIBUTES,
  POSITION_GROUPS,
  POSITION_OVERALL_WEIGHTS,
  POSITION_BASELINES,
  positionalAttributesFor,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_GROUPS,
  type AttributeKey,
} from "../src/models/attributes.js";
import { POSITION_ARCHETYPES } from "../src/models/archetypes.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { buildPlayerCard } from "../src/models/playerCard.js";
import { SeededRng } from "../src/rng.js";
import type { Position } from "../src/types.js";

const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];

describe("attribute taxonomy", () => {
  it("gives every position overall weights that sum to 1", () => {
    for (const position of ALL_POSITIONS) {
      const total = Object.values(POSITION_OVERALL_WEIGHTS[position]).reduce((sum, w) => sum + w, 0);
      expect(total, `${position} weights`).toBeCloseTo(1, 5);
    }
  });

  it("only weights attributes the position actually has", () => {
    for (const position of ALL_POSITIONS) {
      const available = new Set<AttributeKey>([
        ...GENERAL_ATTRIBUTES,
        ...positionalAttributesFor(position),
      ]);
      for (const key of Object.keys(POSITION_OVERALL_WEIGHTS[position]) as AttributeKey[]) {
        expect(available.has(key), `${position} weights unavailable attribute ${key}`).toBe(true);
      }
    }
  });

  it("has a label for every attribute", () => {
    const allKeys: AttributeKey[] = [
      ...GENERAL_ATTRIBUTES,
      ...Object.values(ATTRIBUTE_GROUPS).flat(),
    ];
    for (const key of allKeys) {
      expect(ATTRIBUTE_LABELS[key], `missing label for ${key}`).toBeDefined();
      expect(ATTRIBUTE_LABELS[key].abbr.length).toBeLessThanOrEqual(3);
    }
  });

  it("defines a baseline for exactly the attributes each position has", () => {
    for (const position of ALL_POSITIONS) {
      const expected = new Set<AttributeKey>([
        ...GENERAL_ATTRIBUTES,
        ...positionalAttributesFor(position),
      ]);
      const actual = new Set(Object.keys(POSITION_BASELINES[position]) as AttributeKey[]);
      expect(actual, `${position} baselines`).toEqual(expected);
    }
  });

  it("keeps mean overall comparable across positions", () => {
    // A quarterback and a cornerback rated 80 should represent similar value;
    // otherwise team ratings skew toward whichever positions rate high.
    const rng = new SeededRng(808);
    const means = ALL_POSITIONS.map((position) => {
      const ratings = Array.from({ length: 400 }, () =>
        computeOverall(generatePlayer(position, rng, "Parity")),
      );
      return ratings.reduce((sum, v) => sum + v, 0) / ratings.length;
    });
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(3);
  });

  it("only lets archetypes modify attributes their position has", () => {
    for (const position of ALL_POSITIONS) {
      const available = new Set<AttributeKey>([
        ...GENERAL_ATTRIBUTES,
        ...positionalAttributesFor(position),
      ]);
      for (const archetype of POSITION_ARCHETYPES[position]) {
        for (const key of Object.keys(archetype.modifiers) as AttributeKey[]) {
          expect(
            available.has(key),
            `${position} archetype "${archetype.id}" modifies unavailable attribute ${key}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("player generation", () => {
  it("generates unique, incrementing ids", () => {
    resetPlayerIdCounter();
    const rng = new SeededRng(1);
    const a = generatePlayer("QB", rng, "Test One");
    const b = generatePlayer("QB", rng, "Test Two");
    expect(a.id).not.toEqual(b.id);
  });

  it("gives every player all general attributes, within [20, 99]", () => {
    const rng = new SeededRng(99);
    for (const position of ALL_POSITIONS) {
      const player = generatePlayer(position, rng, "Bounds Check");
      for (const key of GENERAL_ATTRIBUTES) {
        const value = player.general[key];
        expect(value, `${position}.${key}`).toBeGreaterThanOrEqual(20);
        expect(value, `${position}.${key}`).toBeLessThanOrEqual(99);
      }
    }
  });

  it("gives each position exactly its own positional attributes and no others", () => {
    const rng = new SeededRng(7);
    for (const position of ALL_POSITIONS) {
      const player = generatePlayer(position, rng, "Group Check");
      const expected = new Set(positionalAttributesFor(position));
      const actual = new Set(Object.keys(player.positional));
      expect(actual, `${position} positional attributes`).toEqual(expected);
    }
  });

  it("keeps positions physically distinct — receivers outrun linemen, linemen outmuscle corners", () => {
    const rng = new SeededRng(17);
    const samples = 300;
    const meanOf = (position: Position, key: "speed" | "strength") => {
      let total = 0;
      for (let i = 0; i < samples; i++) {
        total += generatePlayer(position, rng, "Physical").general[key];
      }
      return total / samples;
    };

    expect(meanOf("WR", "speed")).toBeGreaterThan(meanOf("OL", "speed") + 15);
    expect(meanOf("OL", "strength")).toBeGreaterThan(meanOf("CB", "strength") + 15);
  });

  it("keeps a running back a worse pass blocker than an offensive lineman", () => {
    const rng = new SeededRng(19);
    const samples = 300;
    let backTotal = 0;
    let lineTotal = 0;
    for (let i = 0; i < samples; i++) {
      backTotal += generatePlayer("RB", rng, "Back").positional.passBlock ?? 0;
      lineTotal += generatePlayer("OL", rng, "Line").positional.passBlock ?? 0;
    }
    expect(lineTotal / samples).toBeGreaterThan(backTotal / samples + 15);
  });

  it("does not give a cornerback passing attributes", () => {
    const rng = new SeededRng(11);
    const corner = generatePlayer("CB", rng, "No Arm");
    expect(corner.positional.throwPower).toBeUndefined();
    expect(getAttribute(corner, "throwPower")).toBeUndefined();
    expect(getAttribute(corner, "manCoverage")).toBeDefined();
    expect(getAttribute(corner, "speed")).toBeDefined();
  });

  it("produces a valid overall for every position", () => {
    const rng = new SeededRng(13);
    for (const position of ALL_POSITIONS) {
      const player = generatePlayer(position, rng, "Overall Check");
      const overall = computeOverall(player);
      expect(overall, position).toBeGreaterThan(0);
      expect(overall, position).toBeLessThanOrEqual(99);
    }
  });
});

describe("archetypes", () => {
  it("makes a man corner better in man coverage and a zone corner better in zone", () => {
    // Average over many players so the archetype signal beats per-player variance.
    const rng = new SeededRng(4242);
    let manCornerMan = 0;
    let zoneCornerMan = 0;
    let manCornerZone = 0;
    let zoneCornerZone = 0;
    const samples = 200;

    for (let i = 0; i < samples; i++) {
      const manCorner = generatePlayer("CB", rng, "Man", { archetypeId: "manCorner" });
      const zoneCorner = generatePlayer("CB", rng, "Zone", { archetypeId: "zoneCorner" });
      manCornerMan += manCorner.positional.manCoverage ?? 0;
      manCornerZone += manCorner.positional.zoneCoverage ?? 0;
      zoneCornerMan += zoneCorner.positional.manCoverage ?? 0;
      zoneCornerZone += zoneCorner.positional.zoneCoverage ?? 0;
    }

    expect(manCornerMan / samples).toBeGreaterThan(zoneCornerMan / samples);
    expect(zoneCornerZone / samples).toBeGreaterThan(manCornerZone / samples);
  });

  it("trades strengths for weaknesses rather than being strictly better", () => {
    // A Road Grader should out-run-block and under-pass-block a Pass Protector.
    const rng = new SeededRng(555);
    let graderRun = 0;
    let protectorRun = 0;
    let graderPass = 0;
    let protectorPass = 0;
    const samples = 200;

    for (let i = 0; i < samples; i++) {
      const grader = generatePlayer("OL", rng, "Grader", { archetypeId: "roadGrader" });
      const protector = generatePlayer("OL", rng, "Protector", { archetypeId: "passProtector" });
      graderRun += grader.positional.runBlock ?? 0;
      graderPass += grader.positional.passBlock ?? 0;
      protectorRun += protector.positional.runBlock ?? 0;
      protectorPass += protector.positional.passBlock ?? 0;
    }

    expect(graderRun / samples).toBeGreaterThan(protectorRun / samples);
    expect(protectorPass / samples).toBeGreaterThan(graderPass / samples);
  });

  it("rejects an archetype that does not belong to the position", () => {
    const rng = new SeededRng(1);
    expect(() => generatePlayer("CB", rng, "Wrong", { archetypeId: "roadGrader" })).toThrow();
  });
});

describe("player card", () => {
  it("splits stats into a general tier plus one section per positional group", () => {
    const rng = new SeededRng(31);
    const quarterback = generatePlayer("QB", rng, "Card Test");
    const card = buildPlayerCard(quarterback);

    expect(card.general).toHaveLength(GENERAL_ATTRIBUTES.length);
    expect(card.positionalSections.map((s) => s.title)).toHaveLength(
      POSITION_GROUPS.QB.length,
    );
    expect(card.overall).toBe(computeOverall(quarterback));
    expect(card.archetype).toBe(quarterback.archetypeName);
  });

  it("never shows a stat the player does not have", () => {
    const rng = new SeededRng(32);
    for (const position of ALL_POSITIONS) {
      const player = generatePlayer(position, rng, "Card Bounds");
      const card = buildPlayerCard(player);
      const shown = card.positionalSections.flatMap((s) => s.stats.map((stat) => stat.key));
      const allowed = new Set(positionalAttributesFor(position));
      for (const key of shown) {
        expect(allowed.has(key as never), `${position} card shows ${key}`).toBe(true);
      }
    }
  });
});
