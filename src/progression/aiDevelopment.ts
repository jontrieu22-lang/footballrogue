import type { AttributeKey } from "../models/attributes.js";
import { getAttribute, type Player } from "../models/player.js";
import type { SkillNode } from "../models/skillTree.js";
import type { Team } from "../models/team.js";
import { schemeForPosition, schemeWeightFor, type SchemeId } from "../schemes.js";
import { availableNodes, unlockNode } from "./skills.js";

/**
 * Scores a node for a player by how much the team's scheme cares about what it
 * improves, with a nudge toward what the player is already good at.
 *
 * The scheme term is what makes AI teams develop coherently: a Cover-2 team
 * pushes its corners toward zone nodes, so opponents keep getting better at
 * the thing they are built to do rather than drifting into a generic blob.
 */
function scoreNode(player: Player, node: SkillNode, scheme: SchemeId | undefined): number {
  let score = 0;

  for (const [key, bonus] of Object.entries(node.modifiers) as [AttributeKey, number][]) {
    const schemeWeight = scheme === undefined ? 1 : schemeWeightFor(scheme, key);
    const current = getAttribute(player, key) ?? 50;
    // Leaning into a strength compounds; the scheme decides whether it matters.
    const strengthFactor = 0.7 + current / 200;
    score += bonus * schemeWeight * strengthFactor;
  }

  return score;
}

/** Spends one player's points, repeatedly, while anything is affordable. */
export function developPlayer(player: Player, scheme: SchemeId | undefined): void {
  while (true) {
    const options = availableNodes(player);
    if (options.length === 0) return;

    let best = options[0];
    if (!best) return;
    let bestScore = scoreNode(player, best, scheme);

    for (const node of options.slice(1)) {
      const score = scoreNode(player, node, scheme);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }

    const result = unlockNode(player, best.id);
    if (!result.ok) return;
  }
}

/** Spends development points across a whole roster. */
export function developTeam(team: Team): void {
  for (const player of team.roster) {
    developPlayer(player, schemeForPosition(player.position, team.scheme));
  }
}
