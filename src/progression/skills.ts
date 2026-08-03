import type { AttributeKey } from "../models/attributes.js";
import type { Player } from "../models/player.js";
import { getSkillNode, getSkillTree, type SkillNode } from "../models/skillTree.js";

export type UnlockFailure =
  | "unknown-node"
  | "wrong-position"
  | "already-unlocked"
  | "tier-already-taken"
  | "tier-locked"
  | "insufficient-points";

export type UnlockResult = { ok: true; node: SkillNode } | { ok: false; reason: UnlockFailure };

/** Highest tier this player has taken a node from; 0 when the tree is untouched. */
export function highestUnlockedTier(player: Player): number {
  let highest = 0;
  for (const id of player.unlockedNodeIds) {
    const node = getSkillNode(id);
    if (node && node.tier > highest) highest = node.tier;
  }
  return highest;
}

function hasNodeInTier(player: Player, tier: number): boolean {
  return player.unlockedNodeIds.some((id) => getSkillNode(id)?.tier === tier);
}

/**
 * Why a node can or cannot be taken right now. One node per tier, tiers in
 * order, and the points have to be there.
 */
export function canUnlock(player: Player, nodeId: string): UnlockResult {
  const node = getSkillNode(nodeId);
  if (!node) return { ok: false, reason: "unknown-node" };

  const belongsToPosition = getSkillTree(player.position).some((tier) =>
    tier.some((candidate) => candidate.id === nodeId),
  );
  if (!belongsToPosition) return { ok: false, reason: "wrong-position" };

  if (player.unlockedNodeIds.includes(nodeId)) return { ok: false, reason: "already-unlocked" };
  if (hasNodeInTier(player, node.tier)) return { ok: false, reason: "tier-already-taken" };
  if (node.tier > highestUnlockedTier(player) + 1) return { ok: false, reason: "tier-locked" };
  if (player.developmentPoints < node.cost) return { ok: false, reason: "insufficient-points" };

  return { ok: true, node };
}

/**
 * Spends the points and applies the node's bonuses. Mutates the player, which
 * is deliberate — development is permanent, unlike scheme fit.
 */
export function unlockNode(player: Player, nodeId: string): UnlockResult {
  const result = canUnlock(player, nodeId);
  if (!result.ok) return result;

  const { node } = result;
  player.developmentPoints -= node.cost;
  player.unlockedNodeIds.push(node.id);

  for (const [key, bonus] of Object.entries(node.modifiers) as [AttributeKey, number][]) {
    player.skillBonuses[key] = (player.skillBonuses[key] ?? 0) + bonus;
  }

  return result;
}

/** Nodes the player could take right now, given their points and tree progress. */
export function availableNodes(player: Player): SkillNode[] {
  return getSkillTree(player.position)
    .flat()
    .filter((node) => canUnlock(player, node.id).ok);
}

/** Nodes in the next tier, whether or not the player can currently afford them. */
export function nextTierChoices(player: Player): SkillNode[] {
  const nextTier = highestUnlockedTier(player) + 1;
  const tree = getSkillTree(player.position);
  return [...(tree[nextTier - 1] ?? [])];
}
