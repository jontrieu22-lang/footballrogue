import type { DefenseSchemeId, OffenseSchemeId } from "./types.js";

export const OFFENSE_SCHEMES: readonly OffenseSchemeId[] = ["powerRun", "airRaid", "westCoast", "rpo"];
export const DEFENSE_SCHEMES: readonly DefenseSchemeId[] = ["base43", "odd34", "cover2Zone", "blitzMan"];

/**
 * Multiplier applied to the offense's effective rating for a given
 * offense-vs-defense scheme matchup. 1.0 is neutral; >1 favors the offense,
 * <1 favors the defense. Deliberately a soft web rather than a strict
 * rock-paper-scissors cycle — see DESIGN.md §6.
 */
const SCHEME_MATCHUPS: Record<OffenseSchemeId, Record<DefenseSchemeId, number>> = {
  powerRun: { base43: 0.97, odd34: 0.95, cover2Zone: 1.08, blitzMan: 1.02 },
  airRaid: { base43: 1.0, odd34: 1.03, cover2Zone: 0.92, blitzMan: 1.05 },
  westCoast: { base43: 1.02, odd34: 1.0, cover2Zone: 1.0, blitzMan: 0.9 },
  rpo: { base43: 1.03, odd34: 0.98, cover2Zone: 1.0, blitzMan: 1.08 },
};

export function getSchemeMultiplier(offense: OffenseSchemeId, defense: DefenseSchemeId): number {
  return SCHEME_MATCHUPS[offense][defense];
}
