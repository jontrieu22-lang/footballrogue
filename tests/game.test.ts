import { describe, it, expect } from "vitest";
import {
  deal,
  lockTeam,
  newGame,
  applyResult,
  kick,
  kickChance,
  nextRound,
  replaceCard,
  resolvePlay,
  PLAYS,
  DEFENSES,
  type Team,
} from "../src/game";
const team = (prefix: string): Team => {
  const cards = deal(12, prefix);
  return lockTeam({ cards, lineup: cards.slice(0, 10).map((c) => c.id) });
};
const game = () => newGame([team("a"), team("b")]);
const touchdown = { yards: 100, turnover: false, text: "TD" };
const stop = { yards: 0, turnover: true, text: "INT" };
describe("cards and lineups", () => {
  it("deals balanced unique cards bounded 1–10", () => {
    const cards = deal(100, "a");
    expect(new Set(cards.map((c) => c.id)).size).toBe(100);
    for (const c of cards) {
      expect(c.stats.reduce((a, b) => a + b)).toBe(45);
      expect(c.stats.every((v) => v >= 1 && v <= 10)).toBe(true);
    }
  });
  it("discards two and forbids duplicate assignments", () => {
    const t = team("a");
    expect(t.cards).toHaveLength(10);
    expect(() =>
      lockTeam({ ...t, lineup: Array(10).fill(t.lineup[0]) }),
    ).toThrow();
  });
  it("replacement removes old card and retains ten unique starters", () => {
    const t = team("a"),
      c = deal(1, "new")[0]!;
    const next = replaceCard(t, 3, c);
    expect(next.cards).toHaveLength(10);
    expect(next.cards.some((c) => c.id === t.lineup[3])).toBe(false);
    expect(next.lineup[3]).toBe(c.id);
  });
});
describe("paired possessions and scoring", () => {
  it("requires the answering possession even after reaching 21", () => {
    let g = game();
    g.scores = [14, 14];
    g = applyResult(g, touchdown);
    expect(g.winner).toBe(null);
    expect(g.offense).toBe(1);
    g = applyResult(g, stop);
    expect(g.winner).toBe(0);
  });
  it("continues tied games and alternates first possession", () => {
    let g = game();
    g.scores = [14, 14];
    g = applyResult(applyResult(g, touchdown), touchdown);
    expect(g.scores).toEqual([21, 21]);
    expect(g.upgrade).toBe(true);
    g = nextRound(g, g.teams);
    expect(g.offense).toBe(1);
    expect(g.round).toBe(2);
  });
  it("converts first downs and turns over after four failures", () => {
    let g = applyResult(game(), { yards: 6, turnover: false, text: "run" });
    expect([g.yard, g.down, g.toGo]).toEqual([56, 2, 4]);
    g = applyResult(g, { yards: 4, turnover: false, text: "run" });
    expect([g.yard, g.down, g.toGo]).toEqual([60, 1, 10]);
    for (let i = 0; i < 4; i++)
      g = applyResult(g, { yards: 0, turnover: false, text: "incomplete" });
    expect(g.offense).toBe(1);
    expect(g.yard).toBe(50);
  });
  it("sets goal-to-go and handles negative gains", () => {
    let g = { ...game(), yard: 95, toGo: 5 };
    g = applyResult(g, { yards: -3, turnover: false, text: "sack" });
    expect(g.toGo).toBe(8);
    expect(g.yard).toBe(92);
  });
  it("ends round eight with a leader and gives tied teams equal short fields", () => {
    let g = { ...game(), round: 8, scores: [3, 0] as [number, number] };
    g = applyResult(applyResult(g, stop), stop);
    expect(g.winner).toBe(0);
    let tied = applyResult(applyResult({ ...game(), round: 8 }, stop), stop);
    tied = nextRound(tied, tied.teams);
    expect(tied.yard).toBe(80);
    expect(applyResult(tied, stop).yard).toBe(80);
  });
});
describe("field goals", () => {
  it("uses the agreed curve and interpolates", () => {
    expect(kickChance(50)).toBe(0.8);
    expect(kickChance(45)).toBe(0.85);
    expect(kickChance(47.5)).toBeCloseTo(0.825);
    expect(kickChance(66)).toBe(0);
    expect(kickChance(20)).toBe(0.98);
  });
  it("scores three on a make and ends either outcome", () => {
    const g = { ...game(), yard: 67, down: 4 };
    expect(kick(g, () => 0).scores).toEqual([3, 0]);
    expect(kick(g, () => 0.99).scores).toEqual([0, 0]);
    expect(kick(g, () => 0.99).offense).toBe(1);
    expect(() => kick(game())).toThrow();
  });
});
describe("play resolution", () => {
  it("resolves every matchup without invalid results", () => {
    const g = game();
    for (const p of PLAYS)
      for (const d of DEFENSES)
        for (let i = 0; i < 20; i++) {
          const r = resolvePlay(g.teams[0], g.teams[1], p, d);
          expect(Number.isFinite(r.yards)).toBe(true);
          expect(r.yards).toBeGreaterThanOrEqual(-7);
          expect(r.yards).toBeLessThanOrEqual(30);
        }
  });
  it("strong blockers and carriers outperform weak ones at identical execution", () => {
    const g = game();
    const strong = {
      ...g.teams[0],
      cards: g.teams[0].cards.map((c) => ({ ...c, stats: Array(9).fill(9) })),
    };
    const weak = {
      ...g.teams[0],
      cards: g.teams[0].cards.map((c) => ({ ...c, stats: Array(9).fill(1) })),
    };
    expect(
      resolvePlay(strong, g.teams[1], "Inside Run", "Balanced", () => 0.5)
        .yards,
    ).toBeGreaterThan(
      resolvePlay(weak, g.teams[1], "Inside Run", "Balanced", () => 0.5).yards,
    );
  });
});

it("plays complete matches with upgrades and valid state throughout", () => {
  for (let match = 0; match < 20; match++) {
    let g = game(),
      snaps = 0;
    while (g.winner === null && snaps < 1500) {
      if (g.upgrade) {
        const upgraded = g.teams.map((t, i) =>
          replaceCard(
            t,
            match % 10,
            deal(1, `m${match}-r${g.round}-p${i}`)[0]!,
          ),
        ) as [Team, Team];
        g = nextRound(g, upgraded);
      } else if (g.down === 4 && kickChance(117 - g.yard) > 0) {
        g = kick(g);
      } else {
        g = applyResult(
          g,
          resolvePlay(
            g.teams[g.offense]!,
            g.teams[1 - g.offense]!,
            PLAYS[snaps % 6]!,
            DEFENSES[snaps % 5]!,
          ),
        );
      }
      expect(
        g.teams.every(
          (t) => t.cards.length === 10 && new Set(t.lineup).size === 10,
        ),
      ).toBe(true);
      expect(g.down).toBeGreaterThanOrEqual(1);
      expect(g.down).toBeLessThanOrEqual(4);
      snaps++;
    }
    expect(g.winner).not.toBe(null);
    expect(g.possession).toBe(1);
  }
});
