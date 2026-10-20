import { scoutRead } from "./scouting";
import {
  lockTeam,
  ROSTER_SIZE,
  HAND_SIZE,
  kickChance,
  type Card,
  type Team,
  type Game,
  type Play,
  type Defense,
} from "./game";
export const ROLE_WEIGHTS = [
  [0.75, 0.25, 0, 0, 0, 0, 0, 0, 0],
  [0, 0.65, 0.35, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0.5, 0.5, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0.5, 0.5],
  [0, 0, 0, 0, 0, 0, 0.75, 0.25, 0],
  [0, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0],
];
export const roleFit = (c: Card, slot: number) =>
  ROLE_WEIGHTS[slot]!.reduce((sum, w, i) => sum + w * c.stats[i]!, 0);
export type OffenseFocus = "balanced" | "passing" | "rushing";
export type DefenseFocus = "balanced" | "pass" | "rush";
export interface DraftFocus {
  offense: OffenseFocus;
  defense: DefenseFocus;
}
export function draftFit(card: Card, slot: number, focus: DraftFocus): number {
  const weights = [...ROLE_WEIGHTS[slot]!];
  let importance = 1;
  if (focus.offense === "passing") {
    if (slot === 0) {
      weights[0] = 1;
      weights[1] = 0;
      importance = 1.25;
    }
    if (slot === 1) {
      weights[1] = 0.25;
      weights[2] = 0.75;
      importance = 0.75;
    }
    if (slot === 2) importance = 1.25;
    if (slot === 3) {
      weights[3] = 0.85;
      weights[4] = 0.15;
    }
  }
  if (focus.offense === "rushing") {
    if (slot === 0) {
      weights[0] = 0.3;
      weights[1] = 0.7;
    }
    if (slot === 1) {
      weights[1] = 0.95;
      weights[2] = 0.05;
      importance = 1.3;
    }
    if (slot === 2) importance = 0.6;
    if (slot === 3) {
      weights[3] = 0.15;
      weights[4] = 0.85;
      importance = 1.1;
    }
  }
  if (focus.defense === "pass") {
    if (slot === 4) {
      weights[7] = 0.85;
      weights[8] = 0.15;
    }
    if (slot === 5) {
      weights[6] = 0.4;
      weights[7] = 0.6;
      importance = 0.75;
    }
    if (slot === 6) importance = 1.25;
    if (slot === 7) {
      weights[5] = 0.85;
      weights[6] = 0.15;
    }
  }
  if (focus.defense === "rush") {
    if (slot === 4) {
      weights[7] = 0.15;
      weights[8] = 0.85;
      importance = 1.2;
    }
    if (slot === 5) {
      weights[6] = 0.95;
      weights[7] = 0.05;
      importance = 1.2;
    }
    if (slot === 6) importance = 0.6;
    if (slot === 7) {
      weights[5] = 0.15;
      weights[6] = 0.85;
    }
  }
  return (
    importance * weights.reduce((sum, w, i) => sum + w * card.stats[i]!, 0)
  );
}
// Exact assignment over a 10-card hand: maximize fit without reusing athletes.
export function buildCpuTeam(
  cards: Card[],
  focus: DraftFocus = { offense: "balanced", defense: "balanced" },
): Team {
  if (cards.length < ROSTER_SIZE || cards.length > HAND_SIZE)
    throw Error("CPU requires 8–10 cards");
  let states = new Map<number, { score: number; lineup: string[] }>([
    [0, { score: 0, lineup: [] }],
  ]);
  for (let slot = 0; slot < ROSTER_SIZE; slot++) {
    const next = new Map<number, { score: number; lineup: string[] }>();
    for (const [mask, state] of states)
      cards.forEach((card, i) => {
        if (mask & (1 << i)) return;
        const key = mask | (1 << i),
          score = state.score + draftFit(card, slot, focus);
        if (score > (next.get(key)?.score ?? -Infinity))
          next.set(key, { score, lineup: [...state.lineup, card.id] });
      });
    states = next;
  }
  const best = [...states.values()].reduce((a, b) =>
    a.score > b.score ? a : b,
  );
  return lockTeam({ cards, lineup: best.lineup });
}
const rating = (t: Team, slot: number, stat: number) =>
  t.cards.find((c) => c.id === t.lineup[slot])!.stats[stat]!;
export function upgradeCpu(team: Team, offers: Card[]): Team {
  let best = buildCpuTeam(team.cards),
    score = best.lineup.reduce(
      (s, id, i) =>
        s +
        roleFit(
          best.cards.find((c) => c.id === id)!,
          i,
        ),
      0,
    );
  for (const card of offers) {
    const candidate = buildCpuTeam([...team.cards, card]);
    const value = candidate.lineup.reduce(
      (s, id, i) =>
        s +
        roleFit(
          candidate.cards.find((c) => c.id === id)!,
          i,
        ),
      0,
    );
    if (value > score) {
      best = candidate;
      score = value;
    }
  }
  return best;
}
function weighted<T>(options: [T, number][], rng: () => number): T {
  let roll = rng() * options.reduce((s, [, w]) => s + w, 0);
  for (const [value, w] of options) {
    roll -= w;
    if (roll < 0) return value;
  }
  return options.at(-1)![0];
}
// Takes only public state, never the human's selected play or formation.
export function cpuOffense(g: Game, rng = Math.random): Play | "kick" {
  const t = g.teams[g.offense]!,
    r = (slot: number, s: number) => rating(t, slot, s);
  if (
    g.down === 4 &&
    kickChance(117 - g.yard) >= 0.45 &&
    (g.toGo > 2 || g.scores[g.offense]! + 3 >= 21)
  )
    return "kick";
  const recent = g.calls.filter((c) => c.offense === g.offense).slice(-5);
  const blitzReads = recent.filter((c) => c.defense === "Blitz").length;
  const coverageReads = recent.filter(
    (c) => c.defense === "Pass Coverage",
  ).length;
  return weighted<Play>(
    [
      [
        "Inside Run",
        r(1, 1) + r(3, 4) + (g.toGo <= 3 ? 5 : 0) + coverageReads * 2,
      ],
      ["Outside Run", r(1, 1) + r(3, 4)],
      ["QB Keep", r(0, 1) + r(3, 4)],
      ["Quick Pass", r(0, 0) + r(2, 2)],
      ["Screen", r(0, 0) + r(1, 2) + blitzReads * 3],
      ["Deep Pass", r(0, 0) + r(2, 2) + (g.toGo >= 8 ? 5 : 0)],
    ],
    rng,
  );
}
export function cpuDefense(g: Game, rng = Math.random): Defense {
  const t = g.teams[g.offense]!;
  const known = (slot: number, stat: number) => {
    const card = t.cards.find((c) => c.id === t.lineup[slot])!;
    const r = scoutRead(g, 1 - g.offense, card.id, stat);
    return (r.min + r.max) / 2;
  };
  const run = known(1, 1) + known(3, 4),
    pass = known(0, 0) + known(2, 2);
  const recent = g.calls.filter((c) => c.offense === g.offense).slice(-5);
  const runReads = recent.filter((c) =>
    ["Inside Run", "Outside Run", "QB Keep"].includes(c.play),
  ).length;
  const deepReads = recent.filter((c) => c.play === "Deep Pass").length;
  return weighted<Defense>(
    [
      ["Balanced", 8],
      ["Run Stop", run + (g.toGo <= 3 ? 7 : 0) + runReads * 2],
      ["Blitz", 10],
      ["Pass Coverage", pass + (g.toGo >= 8 ? 5 : 0) + deepReads * 3],
    ],
    rng,
  );
}
