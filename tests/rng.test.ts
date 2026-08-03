import { describe, expect, it } from "vitest";
import { SeededRng } from "../src/rng.js";

describe("SeededRng", () => {
  it("is deterministic for a given seed", () => {
    const a = new SeededRng(1234);
    const b = new SeededRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("int() stays within the inclusive bounds", () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng.int(3, 8);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(8);
    }
  });
});
