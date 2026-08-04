import type { Team } from "../models/team.js";
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES, type SchemeId } from "../schemes.js";
import type { DefenseSchemeId, OffenseSchemeId } from "../types.js";

export const ALL_SCHEMES: readonly SchemeId[] = [...OFFENSE_SCHEMES, ...DEFENSE_SCHEMES];

/**
 * How familiar a team is with a scheme it has never run. Film study and a
 * league of opponents running it mean nobody starts at zero; the floor is
 * what a coached staff retains without ever having run it. Base schemes start
 * at 1.0 (see initialFamiliarity).
 */
export const FAMILIARITY_FLOOR = 0.3;

/** Familiarity gained per game the scheme is run. A new scheme is fully learned in ~5 games. */
export const FAMILIARITY_GAIN_PER_GAME = 0.15;

/** Familiarity lost per game a scheme is neglected, decaying down to the floor. */
export const FAMILIARITY_DECAY_PER_GAME = 0.1;

/** A fresh team: fluent in its season schemes, league-aware everywhere else. */
export function initialFamiliarity(
  offense: OffenseSchemeId,
  defense: DefenseSchemeId,
): Record<SchemeId, number> {
  const familiarity = Object.fromEntries(
    ALL_SCHEMES.map((scheme) => [scheme, FAMILIARITY_FLOOR]),
  ) as Record<SchemeId, number>;
  familiarity[offense] = 1;
  familiarity[defense] = 1;
  return familiarity;
}

/**
 * Moves familiarity after one played game. The schemes actually run (the
 * weekly plan, not necessarily the season scheme) gain; everything else
 * decays toward the floor.
 */
export function advanceFamiliarity(
  team: Team,
  offense: OffenseSchemeId,
  defense: DefenseSchemeId,
): void {
  for (const scheme of ALL_SCHEMES) {
    const played = scheme === offense || scheme === defense;
    const fam = team.familiarity[scheme];
    team.familiarity[scheme] = played
      ? Math.min(1, fam + FAMILIARITY_GAIN_PER_GAME)
      : Math.max(FAMILIARITY_FLOOR, fam - FAMILIARITY_DECAY_PER_GAME);
  }
}
