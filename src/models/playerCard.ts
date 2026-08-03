import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  GENERAL_ATTRIBUTES,
  GROUP_LABELS,
  POSITION_GROUPS,
  type AttributeGroupName,
  type AttributeKey,
} from "./attributes.js";
import {
  emphasisLevelFor,
  SCHEME_LABELS,
  type EmphasisLevel,
  type SchemeId,
} from "../schemes.js";
import { computeOverall, getAttribute, type Player } from "./player.js";
import { getSkillNode } from "./skillTree.js";
import { nextTierChoices } from "../progression/skills.js";

export interface CardStat {
  key: AttributeKey;
  abbr: string;
  name: string;
  value: number;
  /** True when a skill tree node has raised this stat above its base. */
  developed: boolean;
  /** How the viewing scheme regards this stat; "neutral" when no scheme is applied. */
  emphasis: EmphasisLevel;
}

export interface CardSection {
  title: string;
  stats: CardStat[];
}

export interface CardSkill {
  id: string;
  name: string;
  description: string;
  tier: number;
}

export interface PlayerCard {
  name: string;
  position: string;
  archetype: string;
  age: number;
  /** Unspent development points. */
  developmentPoints: number;
  /** Skill tree nodes already taken. */
  skills: CardSkill[];
  /** Choices at the next tier, and what each would cost. */
  nextChoices: (CardSkill & { cost: number; affordable: boolean })[];
  /** True rating, scheme-independent. */
  overall: number;
  /** Rating in the viewing scheme, when one is supplied. */
  schemeOverall?: number;
  schemeName?: string;
  general: CardStat[];
  positionalSections: CardSection[];
}

function toStat(player: Player, key: AttributeKey, scheme?: SchemeId): CardStat {
  const label = ATTRIBUTE_LABELS[key];
  // Read through getAttribute so the card shows developed values, not the raw
  // roll — a spent skill point has to be visible on the card that sold it.
  const value = getAttribute(player, key) ?? 0;
  return {
    key,
    abbr: label.abbr,
    name: label.name,
    value,
    developed: (player.skillBonuses[key] ?? 0) > 0,
    emphasis: scheme === undefined ? "neutral" : emphasisLevelFor(scheme, key),
  };
}

/**
 * Structured view of a player split into the general tier and one section
 * per positional skill group — the shape a card UI renders directly.
 *
 * Passing a scheme annotates each stat with how that scheme regards it and
 * adds the player's rating within it, so the cost of a bad fit is visible
 * rather than buried in the sim.
 */
export function buildPlayerCard(player: Player, scheme?: SchemeId): PlayerCard {
  const general = GENERAL_ATTRIBUTES.map((key) => toStat(player, key, scheme));

  const positionalSections: CardSection[] = [];
  for (const group of POSITION_GROUPS[player.position] as readonly AttributeGroupName[]) {
    const stats: CardStat[] = [];
    for (const key of ATTRIBUTE_GROUPS[group]) {
      if (player.positional[key] !== undefined) stats.push(toStat(player, key, scheme));
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
    developmentPoints: player.developmentPoints,
    skills: player.unlockedNodeIds.flatMap((id) => {
      const node = getSkillNode(id);
      return node ? [{ id: node.id, name: node.name, description: node.description, tier: node.tier }] : [];
    }),
    nextChoices: nextTierChoices(player).map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      tier: node.tier,
      cost: node.cost,
      affordable: player.developmentPoints >= node.cost,
    })),
    overall: computeOverall(player),
    ...(scheme !== undefined && {
      schemeOverall: computeOverall(player, scheme),
      schemeName: SCHEME_LABELS[scheme],
    }),
    general,
    positionalSections,
  };
}

const CARD_WIDTH = 50;

const EMPHASIS_MARKS: Record<EmphasisLevel, string> = {
  core: "^", // scheme is built around this
  support: "+", // helps
  neutral: " ",
  deEmphasis: "-", // this scheme wastes it
};

function statLine(stats: CardStat[], perRow: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < stats.length; i += perRow) {
    const row = stats
      .slice(i, i + perRow)
      .map((s) => `${s.abbr} ${String(s.value).padStart(2)}${EMPHASIS_MARKS[s.emphasis]}`)
      .join(" ");
    lines.push(row);
  }
  return lines;
}

/** Terminal rendering of a player card, for the CLI demo. */
export function renderPlayerCard(player: Player, scheme?: SchemeId): string {
  const card = buildPlayerCard(player, scheme);
  const pad = (text: string) => `│ ${text.padEnd(CARD_WIDTH - 4)} │`;
  const rule = (left: string, right: string) => `${left}${"─".repeat(CARD_WIDTH - 2)}${right}`;

  const lines: string[] = [rule("┌", "┐")];
  lines.push(pad(card.name));
  lines.push(pad(`${card.position}  ${card.archetype}`));

  if (card.schemeOverall === undefined) {
    lines.push(pad(`Age ${card.age}      OVR ${card.overall}`));
  } else {
    const delta = card.schemeOverall - card.overall;
    const sign = delta >= 0 ? "+" : "";
    lines.push(pad(`Age ${card.age}      OVR ${card.overall}  ->  ${card.schemeOverall} (${sign}${delta})`));
    lines.push(pad(`in ${card.schemeName}`));
  }

  lines.push(rule("├", "┤"));
  lines.push(pad("GENERAL"));
  for (const row of statLine(card.general, 4)) lines.push(pad(`  ${row}`));

  for (const section of card.positionalSections) {
    lines.push(rule("├", "┤"));
    lines.push(pad(section.title.toUpperCase()));
    for (const row of statLine(section.stats, 4)) lines.push(pad(`  ${row}`));
  }

  lines.push(rule("├", "┤"));
  lines.push(pad(`SKILLS${" ".repeat(6)}${card.developmentPoints} pts unspent`));
  if (card.skills.length === 0) {
    lines.push(pad("  (none yet)"));
  } else {
    for (const skill of card.skills) lines.push(pad(`  T${skill.tier} ${skill.name}`));
  }
  for (const choice of card.nextChoices) {
    lines.push(pad(`  ${choice.affordable ? ">" : "-"} T${choice.tier} ${choice.name} (${choice.cost})`));
  }

  lines.push(rule("└", "┘"));
  return lines.join("\n");
}
