import {
  lockTeam,
  kickChance,
  type Card,
  type Team,
  type Game,
  type Play,
  type Defense,
} from "./game";
const weights = [
  [0.75, 0.25, 0, 0, 0, 0, 0, 0, 0],
  [0, 0.8, 0, 0, 0.2, 0, 0, 0, 0],
  [0, 0, 0.85, 0.15, 0, 0, 0, 0, 0],
  [0, 0.4, 0.4, 0.1, 0.1, 0, 0, 0, 0],
  [0, 0, 0, 0.5, 0.5, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0.9, 0.1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0.5, 0.2, 0.3],
  [0, 0, 0, 0, 0, 0, 0, 0.5, 0.5],
  [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0],
  [0, 0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25],
];
const fit = (c: Card, slot: number) =>
  weights[slot]!.reduce((sum, w, i) => sum + w * c.stats[i]!, 0);
// Exact assignment over a 12-card hand: maximize fit without reusing athletes.
export function buildCpuTeam(cards: Card[]): Team {
  if (cards.length < 10 || cards.length > 13)
    throw Error("CPU requires 10–13 cards");
  let states = new Map<number, { score: number; lineup: string[] }>([
    [0, { score: 0, lineup: [] }],
  ]);
  for (let slot = 0; slot < 10; slot++) {
    const next = new Map<number, { score: number; lineup: string[] }>();
    for (const [mask, state] of states)
      cards.forEach((card, i) => {
        if (mask & (1 << i)) return;
        const key = mask | (1 << i),
          score = state.score + fit(card, slot);
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
        fit(
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
        fit(
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
  return weighted<Play>(
    [
      ["Inside Run", r(1, 1) + r(4, 4) + (g.toGo <= 3 ? 5 : 0)],
      ["Outside Run", r(3, 1) + r(4, 4)],
      ["QB Keep", r(0, 1) + r(1, 4)],
      ["Quick Pass", r(0, 0) + r(2, 2)],
      ["Screen", r(0, 0) + r(3, 2)],
      ["Deep Pass", r(0, 0) + r(2, 2) + (g.toGo >= 8 ? 5 : 0)],
    ],
    rng,
  );
}
export function cpuDefense(g: Game, rng = Math.random): Defense {
  const t = g.teams[g.offense]!,
    run = rating(t, 1, 1) + rating(t, 4, 4),
    pass = rating(t, 0, 0) + rating(t, 2, 2);
  return weighted<Defense>(
    [
      ["Balanced", 8],
      ["Stack the Box", run + (g.toGo <= 3 ? 7 : 0)],
      ["Contain / Spy", rating(t, 0, 1) + rating(t, 3, 1)],
      ["Blitz", 10],
      ["Deep Coverage", pass + (g.toGo >= 8 ? 5 : 0)],
    ],
    rng,
  );
}
