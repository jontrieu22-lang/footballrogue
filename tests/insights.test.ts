import { it, expect } from "vitest";
import { buildCpuTeam } from "../src/cpu";
import { deal, newGame } from "../src/game";
import {
  tendencies,
  matchups,
  upgradeOptions,
  type CallRecord,
} from "../src/insights";
it("shows only the relevant opponent’s last five revealed calls", () => {
  const calls: CallRecord[] = Array.from({ length: 7 }, (_, i) => ({
    offense: i === 6 ? 1 : 0,
    play: "Inside Run",
    defense: i === 0 ? "Blitz" : "Balanced",
  }));
  const report = tendencies(calls, 1, "defense");
  expect(report.total).toBe(5);
  expect(report.counts).toEqual([{ name: "Balanced", count: 5 }]);
  expect(tendencies([], 1, "offense").total).toBe(0);
});
it("starts matchup reads unscouted without reading opponent ratings", () => {
  const a = buildCpuTeam(deal(10, "a")),
    b = buildCpuTeam(deal(10, "b"));
  const g = newGame([a, b]);
  expect(
    matchups(a, b, "Inside Run", g, 0).every(
      (r) => r.assessment === "Unscouted",
    ),
  ).toBe(true);
});
it("shows positive and negative replacement deltas for every slot", () => {
  const t = buildCpuTeam(deal(10, "a"));
  const ol = t.cards.find((c) => c.id === t.lineup[3])!;
  const replacement = {
    ...ol,
    id: "new",
    stats: ol.stats.map((v, i) => (i === 3 ? 10 : i === 4 ? 1 : v)),
  };
  const options = upgradeOptions(t, replacement);
  expect(options).toHaveLength(8);
  const change = options.find((o) => o.slot === "OL")!;
  expect(change.changes[0]!.delta).toBe(10 - ol.stats[3]!);
  expect(change.changes[1]!.delta).toBe(1 - ol.stats[4]!);
});
