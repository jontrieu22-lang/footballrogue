import { it, expect } from "vitest";
import { deal, newGame, validateLineup, PLAYS, DEFENSES } from "../src/game";
import { buildCpuTeam, upgradeCpu, cpuOffense, cpuDefense } from "../src/cpu";
it("builds a legal team from ten cards without modifying the hand", () => {
  const cards = deal(10, "cpu");
  const t = buildCpuTeam(cards);
  expect(validateLineup(t)).toBe(true);
  expect(t.cards).toHaveLength(8);
  expect(cards).toHaveLength(10);
});
it("upgrades with at most one offered card and preserves a complete roster", () => {
  const team = buildCpuTeam(deal(10, "cpu"));
  const offers = deal(3, "offer");
  const upgraded = upgradeCpu(team, offers);
  expect(validateLineup(upgraded)).toBe(true);
  expect(
    upgraded.cards.filter((c) => offers.some((o) => o.id === c.id)).length,
  ).toBeLessThanOrEqual(1);
});
it("chooses legal calls using public state and kicks from a good fourth-down position", () => {
  const g = newGame([buildCpuTeam(deal(10, "a")), buildCpuTeam(deal(10, "b"))]);
  for (const n of [0, 0.2, 0.5, 0.9, 0.999]) {
    expect(PLAYS).toContain(cpuOffense(g, () => n));
    expect(DEFENSES).toContain(cpuDefense(g, () => n));
  }
  expect(cpuOffense({ ...g, down: 4, yard: 75, toGo: 8 })).toBe("kick");
  expect(cpuOffense({ ...g, down: 4, yard: 50, toGo: 8 })).not.toBe("kick");
});
