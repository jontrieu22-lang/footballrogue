import {
  applyResult,
  type Game,
  type Card,
  type Play,
  type Defense,
  type Result,
  type ScoutRead,
} from "./game";
export const unknownRead: ScoutRead = { observations: 0, min: 1, max: 10 };
export function scoutRead(
  game: Game,
  viewer: number,
  cardId: string,
  stat: number,
): ScoutRead {
  return game.scouting[viewer]?.[cardId]?.[stat] ?? unknownRead;
}
export function describeRead(read: ScoutRead): string {
  return read.observations === 0
    ? "Unknown"
    : read.observations === 1
      ? `≥ ${read.min}`
      : read.observations === 2
        ? `${read.min}–${read.max}`
        : `${read.min}`;
}
function observe(old: ScoutRead, card: Card, stat: number): ScoutRead {
  const observations = Math.min(3, old.observations + 1),
    value = card.stats[stat]!;
  // Bucketed bounds: a lower bound never encodes an exact stat via subtraction.
  if (observations === 1)
    return { observations, min: value <= 5 ? 1 : 4, max: 10 };
  if (observations === 2)
    return {
      observations,
      min: value <= 3 ? 1 : value <= 6 ? 4 : 7,
      max: value <= 3 ? 3 : value <= 6 ? 6 : 10,
    };
  return { observations, min: value, max: value };
}
export function finishScoutedPlay(
  before: Game,
  result: Result,
  play: Play,
  defense: Defense,
): Game {
  const after = applyResult(before, result);
  const scouting = before.scouting.map((book) =>
    Object.fromEntries(
      Object.entries(book).map(([id, stats]) => [id, { ...stats }]),
    ),
  ) as Game["scouting"];
  const observations = new Set<string>();
  const add = (team: number, slot: number, stat: number) => {
    const card = before.teams[team]!.cards.find(
        (c) => c.id === before.teams[team]!.lineup[slot],
      )!,
      viewer = 1 - team,
      key = `${team}:${card.id}:${stat}`;
    if (observations.has(key)) return;
    observations.add(key);
    const book = scouting[viewer]!;
    book[card.id] ??= {};
    book[card.id]![stat] = observe(
      book[card.id]![stat] ?? unknownRead,
      card,
      stat,
    );
  };
  const offense = before.offense,
    defender = 1 - offense,
    run = ["Inside Run", "Outside Run", "QB Keep"].includes(play);
  if (run) {
    add(offense, play === "QB Keep" ? 0 : 1, 1);
    add(offense, 3, 4);
    add(defender, 4, 8);
    add(defender, 5, 6);
    if (defense !== "Pass Coverage") add(defender, 7, 6);
  } else {
    add(offense, 3, 3);
    add(defender, 4, 7);
    if (defense === "Blitz") add(defender, 5, 7);
    if (result.kind !== "sack") {
      add(offense, 0, 0);
      add(offense, play === "Screen" ? 1 : 2, 2);
      add(defender, 6, 5);
      if (defense !== "Run Stop") add(defender, 7, 5);
      if (result.kind === "completion") {
        add(defender, 5, 6);
        if (defense !== "Pass Coverage") add(defender, 7, 6);
      }
    }
  }
  return {
    ...after,
    scouting,
    calls: [...before.calls, { offense, play, defense }],
  };
}
