export const STATS = [
  "Passing",
  "Rushing",
  "Catching",
  "Pass block",
  "Run block",
  "Coverage",
  "Tackling",
  "Pass rush",
  "Run defense",
] as const;
export const SLOTS = [
  "QB",
  "RB",
  "WR",
  "Flex",
  "OL",
  "CB",
  "LB",
  "DL",
  "Safety",
  "Wildcard",
] as const;
export const PLAYS = [
  "Inside Run",
  "Outside Run",
  "QB Keep",
  "Quick Pass",
  "Screen",
  "Deep Pass",
] as const;
export const DEFENSES = [
  "Balanced",
  "Stack the Box",
  "Contain / Spy",
  "Blitz",
  "Deep Coverage",
] as const;
export type Play = (typeof PLAYS)[number];
export type Defense = (typeof DEFENSES)[number];
export interface Card {
  id: string;
  name: string;
  stats: number[];
}
export interface Team {
  cards: Card[];
  lineup: string[];
}
export interface Result {
  yards: number;
  turnover: boolean;
  text: string;
}
export interface Game {
  teams: [Team, Team];
  scores: [number, number];
  round: number;
  possession: number;
  offense: number;
  yard: number;
  down: number;
  toGo: number;
  winner: number | null;
  upgrade: boolean;
  log: string[];
}
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const first = [
  "Jalen",
  "Kai",
  "Miles",
  "Theo",
  "Dante",
  "Ace",
  "Roman",
  "Jude",
  "Nico",
  "Zion",
  "Cole",
  "Remy",
  "Ezra",
  "Troy",
  "Leon",
  "Max",
];
const last = [
  "Banks",
  "Cross",
  "Reed",
  "Stone",
  "Hayes",
  "Wilder",
  "Fox",
  "Brooks",
  "Knight",
  "West",
  "Cole",
  "Blake",
  "Hart",
  "Frost",
  "King",
  "Vale",
];
export function deal(count: number, prefix: string, rng = Math.random): Card[] {
  return Array.from({ length: count }, (_, i) => {
    const stats = Array<number>(9).fill(1);
    // Every card has exactly 45 points. Shuffle allocation, not power tiers.
    for (let n = 0; n < 36; n++) {
      const available = stats
        .map((v, j) => (v < 10 ? j : -1))
        .filter((j) => j >= 0);
      const j = available[Math.floor(rng() * available.length)]!;
      stats[j]!++;
    }
    return {
      id: `${prefix}-${i}`,
      name: `${first[Math.floor(rng() * first.length)]} ${last[Math.floor(rng() * last.length)]}`,
      stats,
    };
  });
}
export function validateLineup(team: Team) {
  return (
    team.lineup.length === 10 &&
    new Set(team.lineup).size === 10 &&
    team.lineup.every((id) => team.cards.some((c) => c.id === id))
  );
}
export function lockTeam(team: Team): Team {
  if (!validateLineup(team)) throw new Error("Assign ten different cards.");
  return {
    lineup: [...team.lineup],
    cards: team.cards.filter((c) => team.lineup.includes(c.id)),
  };
}
export function replaceCard(team: Team, slot: number, card: Card): Team {
  if (slot < 0 || slot > 9 || !Number.isInteger(slot))
    throw new Error("Invalid slot");
  const cards = team.cards.filter((c) => c.id !== team.lineup[slot]);
  const lineup = [...team.lineup];
  lineup[slot] = card.id;
  return lockTeam({ cards: [...cards, card], lineup });
}
export function newGame(teams: [Team, Team]): Game {
  return {
    teams: teams.map(lockTeam) as [Team, Team],
    scores: [0, 0],
    round: 1,
    possession: 0,
    offense: 0,
    yard: 50,
    down: 1,
    toGo: 10,
    winner: null,
    upgrade: false,
    log: [],
  };
}
export function kickChance(distance: number): number {
  const points = [
    [30, 0.98],
    [35, 0.95],
    [40, 0.9],
    [45, 0.85],
    [50, 0.8],
    [55, 0.65],
    [60, 0.45],
    [65, 0.2],
  ];
  if (distance > 65) return 0;
  if (distance <= 30) return 0.98;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    const [px, py] = points[i - 1]!;
    if (distance <= x!)
      return py! + ((y! - py!) * (distance - px!)) / (x! - px!);
  }
  return 0;
}
export function resolvePlay(
  off: Team,
  def: Team,
  play: Play,
  defense: Defense,
  rng = Math.random,
): Result {
  const stat = (team: Team, slot: number, s: number) =>
    team.cards.find((c) => c.id === team.lineup[slot])!.stats[s]!;
  const o = (slot: number, s: number) => stat(off, slot, s),
    d = (slot: number, s: number) => stat(def, slot, s);
  const roll = () => Math.floor(rng() * 3) + Math.floor(rng() * 3) - 2;
  const box = defense === "Stack the Box",
    blitz = defense === "Blitz",
    deep = defense === "Deep Coverage",
    contain = defense === "Contain / Spy";
  const tackle = 0.6 * d(6, 6) + 0.4 * d(8, 6);
  if (PLAYS.indexOf(play) < 3) {
    const carrier = play === "Inside Run" ? 1 : play === "Outside Run" ? 3 : 0;
    const block = 0.7 * o(4, 4) + 0.3 * o(play === "Inside Run" ? 3 : 1, 4);
    let resistance = 0.6 * d(7, 8) + 0.4 * d(6, 8);
    if (box) resistance = 0.75 * resistance + 0.25 * d(9, 8) + 1.5;
    if (deep) resistance -= 1;
    if (contain && play !== "Inside Run")
      resistance = 0.75 * resistance + 0.25 * d(9, 6) + 1.5;
    const edge =
      0.6 * (block - resistance) + 0.4 * (o(carrier, 1) - tackle) + roll();
    const band =
      edge < -3
        ? 0
        : edge < -1
          ? 1
          : edge < 1
            ? 2
            : edge < 3
              ? 3
              : edge < 5
                ? 4
                : 5;
    const gains =
      play === "Inside Run"
        ? [-2, 1, 3, 5, 8, 12]
        : play === "Outside Run"
          ? [-4, 0, 3, 6, 11, 18]
          : [-3, 0, 3, 6, 9, 15];
    return {
      yards: gains[band]!,
      turnover: false,
      text: `${play} vs ${defense}: blocking ${block.toFixed(1)} / resistance ${resistance.toFixed(1)}; runner ${o(carrier, 1)} / tackling ${tackle.toFixed(1)}.`,
    };
  }
  const screen = play === "Screen",
    long = play === "Deep Pass";
  const protection = 0.7 * o(4, 3) + 0.3 * o(long ? 3 : screen ? 2 : 1, 3);
  let pressure = 0.7 * d(7, 7) + 0.3 * d(6, 7);
  if (blitz) pressure = 0.7 * pressure + 0.3 * d(9, 7) + 1.5;
  if (deep || contain) pressure -= 1;
  const sack = clamp(
    0.08 +
      0.04 * (pressure - protection) +
      (long ? 0.06 : screen ? -0.06 : -0.04),
    0.02,
    0.35,
  );
  if (rng() < sack)
    return {
      yards: long ? -7 : -4,
      turnover: false,
      text: `Sack! ${defense} pressure (${pressure.toFixed(1)}) beat protection (${protection.toFixed(1)}).`,
    };
  const quality = 0.55 * o(0, 0) + 0.45 * o(screen ? 3 : 2, 2);
  let coverage = 0.65 * d(5, 5) + 0.35 * d(8, 5);
  if (deep) coverage = 0.75 * coverage + 0.25 * d(9, 5) + (long ? 1.5 : -0.5);
  if (blitz) coverage -= screen ? 2 : 1;
  if (box) coverage -= long ? 1.5 : 0.5;
  const edge = quality - coverage;
  const completion = clamp(
    (long ? 0.45 : screen ? 0.7 : 0.75) + 0.05 * edge,
    0.1,
    0.95,
  );
  const interception = clamp((long ? 0.04 : 0.015) - 0.006 * edge, 0.005, 0.1);
  const outcome = rng();
  if (outcome < interception)
    return {
      yards: 0,
      turnover: true,
      text: `Intercepted! ${play} met ${defense}. Passing ${quality.toFixed(1)} / coverage ${coverage.toFixed(1)}.`,
    };
  if (outcome >= interception + completion)
    return {
      yards: 0,
      turnover: false,
      text: `Incomplete. ${play}: ${Math.round(completion * 100)}% completion chance after the matchup.`,
    };
  const after = o(screen ? 3 : 2, 2) - tackle + roll();
  const yards = long
    ? clamp(Math.round(20 + after), 15, 30)
    : screen
      ? clamp(Math.round(7 + after + (blitz ? 2 : 0)), 2, 16)
      : clamp(Math.round(6 + after / 2), 4, 10);
  return {
    yards,
    turnover: false,
    text: `Complete! Passing ${quality.toFixed(1)} / coverage ${coverage.toFixed(1)}. ${screen ? "Flex" : "WR"} gains ${yards} yards.`,
  };
}
function finishPossession(g: Game): Game {
  if (g.possession === 0)
    return {
      ...g,
      possession: 1,
      offense: 1 - g.offense,
      yard: g.round > 8 ? 80 : 50,
      down: 1,
      toGo: 10,
    };
  const [a, b] = g.scores;
  // Equal possessions, target 21; eight-round cap prevents endless scoreless games.
  const decided = (Math.max(a, b) >= 21 || g.round >= 8) && a !== b;
  return { ...g, winner: decided ? (a > b ? 0 : 1) : null, upgrade: !decided };
}
export function applyResult(game: Game, result: Result): Game {
  if (game.winner !== null || game.upgrade)
    throw new Error("No active possession");
  let g = {
    ...game,
    scores: [...game.scores] as [number, number],
    log: [
      `P${game.offense + 1} · ${result.text} ${result.turnover ? "Turnover." : `${result.yards >= 0 ? "+" : ""}${result.yards} yd.`}`,
      ...game.log,
    ],
  };
  if (result.turnover) return finishPossession(g);
  const yard = g.yard + result.yards;
  if (yard >= 100) {
    g.scores[g.offense]! += 7;
    g.log.unshift(`Touchdown · Player ${g.offense + 1} +7`);
    return finishPossession(g);
  }
  if (yard <= 0) {
    g.scores[1 - g.offense]! += 2;
    g.log.unshift("Safety · defense +2");
    return finishPossession(g);
  }
  if (result.yards >= g.toGo)
    return { ...g, yard, down: 1, toGo: Math.min(10, 100 - yard) };
  if (g.down === 4) {
    g.log.unshift("Turnover on downs");
    return finishPossession(g);
  }
  return { ...g, yard, down: g.down + 1, toGo: g.toGo - result.yards };
}
export function kick(game: Game, rng = Math.random): Game {
  if (game.down !== 4 || game.upgrade || game.winner !== null)
    throw new Error("Kick unavailable");
  const distance = 117 - game.yard,
    chance = kickChance(distance);
  if (!chance) throw new Error("Out of range");
  const made = rng() < chance,
    scores = [...game.scores] as [number, number];
  if (made) scores[game.offense]! += 3;
  return finishPossession({
    ...game,
    scores,
    log: [
      `${distance}-yard field goal ${made ? "GOOD · +3" : "MISSED"} (${Math.round(chance * 100)}%).`,
      ...game.log,
    ],
  });
}
export function nextRound(game: Game, teams: [Team, Team]): Game {
  if (!game.upgrade) throw new Error("Round not finished");
  const round = game.round + 1;
  return {
    ...game,
    teams: teams.map(lockTeam) as [Team, Team],
    round,
    possession: 0,
    offense: (round - 1) % 2,
    yard: round > 8 ? 80 : 50,
    down: 1,
    toGo: 10,
    upgrade: false,
  };
}
