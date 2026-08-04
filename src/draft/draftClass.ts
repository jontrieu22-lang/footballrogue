import { generatePlayerName } from "../generators/names.js";
import { generatePlayer } from "../generators/playerGenerator.js";
import { computeOverall, type Player } from "../models/player.js";
import type { SeededRng } from "../rng.js";
import type { Position } from "../types.js";

/**
 * A draft class is generated fresh every offseason, so no two franchises ever
 * see the same prospects — the main procedural-generation hook in the run
 * structure (DESIGN.md §4).
 *
 * Prospects are rated lower than established starters but carry higher
 * potential, and what you actually see is a *scouted* estimate rather than the
 * truth. Improving scouting narrows the error, which is what makes a high pick
 * feel like a decision instead of a lottery ticket.
 */

/** Roughly how many prospects appear at each position in a class. */
const CLASS_COMPOSITION: Record<Position, number> = {
  QB: 12, RB: 18, WR: 30, TE: 14, OL: 34, DL: 32, LB: 26, CB: 26, S: 16, K: 4, P: 4,
};

/** Prospects are green: below a veteran starter today, with room to grow. */
const ROOKIE_QUALITY_BIAS = -9;

export interface Prospect {
  player: Player;
  /** What scouting believes the player is worth today. */
  scoutedOverall: number;
  /** What scouting believes the ceiling is. */
  scoutedPotential: number;
  /** Half-width of the scouting error, for showing a range. */
  uncertainty: number;
}

export interface DraftClass {
  season: number;
  prospects: Prospect[];
}

/**
 * Scouting tier narrows the gap between the estimate and the truth. Tier 0 is
 * a rough guess; higher tiers are progressively sharper — this is what
 * meta-progression buys (DESIGN.md §4).
 */
export function scoutingError(scoutingTier: number): number {
  // Wide enough at tier 0 that the top of the sorted board is genuinely
  // scrambled (drafting is a lottery), narrow enough at tier 5 that a pick is
  // a decision instead of a gamble. Measured round-1 pick value improves ~5
  // points (about 4%) from tier 0 to tier 5, with a smooth step per tier.
  return Math.max(1.5, 11 - scoutingTier * 1.9);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function generateDraftClass(
  rng: SeededRng,
  season: number,
  scoutingTier = 0,
): DraftClass {
  const spread = scoutingError(scoutingTier);
  const prospects: Prospect[] = [];

  for (const [position, count] of Object.entries(CLASS_COMPOSITION) as [Position, number][]) {
    for (let i = 0; i < count; i++) {
      // Class strength varies by prospect so a class has genuine top-end talent
      // and genuine busts rather than a flat band.
      const tierBias = rng.gaussian(0, 7);
      const player = generatePlayer(position, rng, generatePlayerName(rng), {
        qualityBias: ROOKIE_QUALITY_BIAS + tierBias,
      });
      player.age = rng.int(21, 23);

      const trueOverall = computeOverall(player);
      prospects.push({
        player,
        scoutedOverall: clamp(rng.gaussian(trueOverall, spread), 20, 99),
        scoutedPotential: clamp(rng.gaussian(player.potential, spread), 30, 99),
        uncertainty: Math.round(spread),
      });
    }
  }

  // Board order is what scouts believe, not what is true — which is exactly
  // why a draft can go wrong.
  prospects.sort(
    (a, b) =>
      b.scoutedOverall + b.scoutedPotential * 0.6 - (a.scoutedOverall + a.scoutedPotential * 0.6),
  );

  return { season, prospects };
}
