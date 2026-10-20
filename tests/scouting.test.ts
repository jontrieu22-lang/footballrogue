import { it, expect } from "vitest";
import { newGame, deal, replaceCard, nextRound, type Game } from "../src/game";
import { buildCpuTeam, cpuDefense } from "../src/cpu";
import { finishScoutedPlay, scoutRead, describeRead } from "../src/scouting";
const setup = () =>
  newGame([buildCpuTeam(deal(10, "a")), buildCpuTeam(deal(10, "b"))]);
it("reveals only involved stats, progresses monotonically, and does not mutate prior knowledge", () => {
  let g = setup();
  const initial = g,
    id = g.teams[1].lineup[4]!;
  const rating = g.teams[1].cards.find((c) => c.id === id)!.stats[8]!;
  expect(describeRead(scoutRead(g, 0, id, 8))).toBe("Unknown");
  for (let i = 1; i <= 3; i++) {
    const old = scoutRead(g, 0, id, 8);
    g = finishScoutedPlay(
      g,
      { yards: 0, turnover: false, kind: "run", text: "Run" },
      "Inside Run",
      "Balanced",
    );
    const read = scoutRead(g, 0, id, 8);
    expect(read.observations).toBe(i);
    expect(read.min).toBeGreaterThanOrEqual(old.min);
    expect(read.max).toBeLessThanOrEqual(old.max);
    expect(read.min).toBeLessThanOrEqual(rating);
    expect(read.max).toBeGreaterThanOrEqual(rating);
  }
  expect(scoutRead(g, 0, id, 8).min).toBe(rating);
  expect(scoutRead(initial, 0, id, 8).observations).toBe(0);
  expect(scoutRead(g, 0, id, 7).observations).toBe(0);
  expect(scoutRead(g, 1, g.teams[0].lineup[0]!, 0).observations).toBe(0);
});
it("sacks reveal protection and rush only, including blitzing LB", () => {
  let g = setup();
  g = finishScoutedPlay(
    g,
    { yards: -7, turnover: false, kind: "sack", text: "Sack" },
    "Deep Pass",
    "Blitz",
  );
  expect(scoutRead(g, 0, g.teams[1].lineup[5]!, 7).observations).toBe(1);
  expect(scoutRead(g, 0, g.teams[1].lineup[6]!, 5).observations).toBe(0);
  expect(scoutRead(g, 1, g.teams[0].lineup[0]!, 0).observations).toBe(0);
  expect(scoutRead(g, 1, g.teams[0].lineup[3]!, 3).observations).toBe(1);
});
it("new cards are unknown while retained cards keep observations across rounds", () => {
  let g = setup();
  g = finishScoutedPlay(
    g,
    { yards: 0, turnover: false, kind: "run", text: "Run" },
    "Inside Run",
    "Balanced",
  );
  const retained = g.teams[1].lineup[4]!;
  const newCard = deal(1, "upgrade")[0]!;
  g = nextRound({ ...g, upgrade: true }, [
    g.teams[0],
    replaceCard(g.teams[1], 5, newCard),
  ]);
  expect(scoutRead(g, 0, retained, 8).observations).toBe(1);
  expect(scoutRead(g, 0, newCard.id, 6).observations).toBe(0);
});
it("CPU defense cannot distinguish unseen opponent stats", () => {
  const g = setup();
  const changed: Game = {
    ...g,
    teams: [
      {
        ...g.teams[0],
        cards: g.teams[0].cards.map((c) => ({
          ...c,
          stats: Array(9).fill(10),
        })),
      },
      g.teams[1],
    ],
  };
  for (let n = 0; n < 100; n++)
    expect(cpuDefense(g, () => n / 100)).toBe(
      cpuDefense(changed, () => n / 100),
    );
});
