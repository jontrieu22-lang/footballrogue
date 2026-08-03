import { describe, expect, it } from "vitest";
import { computeOverall } from "../src/models/player.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { SeededRng } from "../src/rng.js";

describe("player generation", () => {
  it("generates unique, incrementing ids", () => {
    resetPlayerIdCounter();
    const rng = new SeededRng(1);
    const a = generatePlayer("QB", rng, "Test One");
    const b = generatePlayer("QB", rng, "Test Two");
    expect(a.id).not.toEqual(b.id);
  });

  it("keeps every attribute within [20, 99]", () => {
    const rng = new SeededRng(99);
    for (let i = 0; i < 50; i++) {
      const player = generatePlayer("WR", rng, "Attr Bounds");
      for (const value of Object.values(player.attributes)) {
        expect(value).toBeGreaterThanOrEqual(20);
        expect(value).toBeLessThanOrEqual(99);
      }
    }
  });

  it("computes a QB's overall mostly from throwing/awareness", () => {
    const rng = new SeededRng(5);
    const player = generatePlayer("QB", rng, "Strong Arm");
    player.attributes.throwing = 90;
    player.attributes.awareness = 90;
    player.attributes.speed = 40;
    player.attributes.strength = 40;
    const overall = computeOverall(player);
    expect(overall).toBeGreaterThan(70);
    expect(overall).toBeLessThanOrEqual(99);
  });
});
