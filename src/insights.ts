import {
  PLAYS,
  DEFENSES,
  SLOTS,
  type Team,
  type Card,
  type Play,
  type Defense,
} from "./game";
import { roleFit } from "./cpu";
export interface CallRecord {
  offense: number;
  play: Play;
  defense: Defense;
}
const stat = (t: Team, slot: number, s: number) =>
  t.cards.find((c) => c.id === t.lineup[slot])!.stats[s]!;
export function matchups(off: Team, def: Team, play: Play) {
  const run = PLAYS.indexOf(play) < 3,
    screen = play === "Screen";
  return run
    ? [
        { label: "OL blocking vs DL", edge: stat(off, 3, 4) - stat(def, 4, 8) },
        {
          label: `${play === "QB Keep" ? "QB" : "RB"} rushing vs LB`,
          edge: stat(off, play === "QB Keep" ? 0 : 1, 1) - stat(def, 5, 6),
        },
      ]
    : [
        {
          label: "OL protection vs DL",
          edge: stat(off, 3, 3) - stat(def, 4, 7),
        },
        {
          label: `QB + ${screen ? "RB" : "WR"} vs CB`,
          edge:
            0.55 * stat(off, 0, 0) +
            0.45 * stat(off, screen ? 1 : 2, 2) -
            stat(def, 6, 5),
        },
      ];
}
export function tendencies(
  calls: CallRecord[],
  opponent: number,
  view: "offense" | "defense",
) {
  const recent = calls
    .filter((c) =>
      view === "offense" ? c.offense === opponent : c.offense !== opponent,
    )
    .slice(-5);
  const choices = view === "offense" ? PLAYS : DEFENSES;
  return {
    total: recent.length,
    counts: choices
      .map((name) => ({
        name,
        count: recent.filter(
          (c) => (view === "offense" ? c.play : c.defense) === name,
        ).length,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count),
  };
}
const roleStats = [[0, 1], [1, 2], [2], [3, 4], [7, 8], [6, 7], [5], [5, 6]];
export function upgradeOptions(team: Team, card: Card) {
  return SLOTS.map((slot, index) => {
    const current = team.cards.find((c) => c.id === team.lineup[index])!;
    return {
      slot,
      index,
      current: current.name,
      fit: roleFit(card, index) - roleFit(current, index),
      changes: roleStats[index]!.map((stat) => ({
        stat,
        delta: card.stats[stat]! - current.stats[stat]!,
      })),
    };
  }).sort((a, b) => b.fit - a.fit);
}
