import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  GENERAL_ATTRIBUTES,
  GROUP_LABELS,
  POSITION_GROUPS,
  type AttributeGroupName,
  type AttributeKey,
} from "./attributes.js";
import { computeOverall, type Player } from "./player.js";

export interface CardStat {
  key: AttributeKey;
  abbr: string;
  name: string;
  value: number;
}

export interface CardSection {
  title: string;
  stats: CardStat[];
}

export interface PlayerCard {
  name: string;
  position: string;
  archetype: string;
  age: number;
  overall: number;
  general: CardStat[];
  positionalSections: CardSection[];
}

function toStat(key: AttributeKey, value: number): CardStat {
  const label = ATTRIBUTE_LABELS[key];
  return { key, abbr: label.abbr, name: label.name, value };
}

/**
 * Structured view of a player split into the general tier and one section
 * per positional skill group — the shape a card UI renders directly.
 */
export function buildPlayerCard(player: Player): PlayerCard {
  const general = GENERAL_ATTRIBUTES.map((key) => toStat(key, player.general[key]));

  const positionalSections: CardSection[] = [];
  for (const group of POSITION_GROUPS[player.position] as readonly AttributeGroupName[]) {
    const stats: CardStat[] = [];
    for (const key of ATTRIBUTE_GROUPS[group]) {
      const value = player.positional[key];
      if (value !== undefined) stats.push(toStat(key, value));
    }
    if (stats.length > 0) {
      positionalSections.push({ title: GROUP_LABELS[group], stats });
    }
  }

  return {
    name: player.name,
    position: player.position,
    archetype: player.archetypeName,
    age: player.age,
    overall: computeOverall(player),
    general,
    positionalSections,
  };
}

const CARD_WIDTH = 46;

function statLine(stats: CardStat[], perRow: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < stats.length; i += perRow) {
    const row = stats
      .slice(i, i + perRow)
      .map((s) => `${s.abbr} ${String(s.value).padStart(2)}`)
      .join("  ");
    lines.push(row);
  }
  return lines;
}

/** Terminal rendering of a player card, for the CLI demo. */
export function renderPlayerCard(player: Player): string {
  const card = buildPlayerCard(player);
  const pad = (text: string) => `│ ${text.padEnd(CARD_WIDTH - 4)} │`;
  const rule = (left: string, right: string) => `${left}${"─".repeat(CARD_WIDTH - 2)}${right}`;

  const lines: string[] = [rule("┌", "┐")];
  lines.push(pad(`${card.name}`));
  lines.push(pad(`${card.position}  ${card.archetype}`));
  lines.push(pad(`Age ${card.age}${" ".repeat(6)}OVR ${card.overall}`));
  lines.push(rule("├", "┤"));

  lines.push(pad("GENERAL"));
  for (const row of statLine(card.general, 4)) lines.push(pad(`  ${row}`));

  for (const section of card.positionalSections) {
    lines.push(rule("├", "┤"));
    lines.push(pad(section.title.toUpperCase()));
    for (const row of statLine(section.stats, 4)) lines.push(pad(`  ${row}`));
  }

  lines.push(rule("└", "┘"));
  return lines.join("\n");
}
