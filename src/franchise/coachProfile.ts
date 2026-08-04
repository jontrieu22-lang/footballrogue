/**
 * The coach profile is the meta-progression that survives a run: the part of
 * the roguelike that is not the franchise. Being fired ends the run — that
 * team, that patience bar, that history — but the coach keeps their seasons
 * coached, their career record, and their championships, and starts the next
 * run with the read advantage (and the sharper scouting) those buy.
 *
 * Everything here is plain data so it round-trips through the save envelope.
 * The profile lives in its own storage slot, separate from the run save.
 */

export interface CareerRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface CoachProfile {
  /** The coach's name — their identity across runs, not the team's. */
  name: string;
  /** Career seasons coached. A fresh hire starts at 0. */
  experience: number;
  /** Every game the coach has ever been on the sideline for, all runs. */
  careerRecord: CareerRecord;
  championships: number;
}

export function createCoachProfile(name: string): CoachProfile {
  return {
    name,
    experience: 0,
    careerRecord: { wins: 0, losses: 0, ties: 0 },
    championships: 0,
  };
}

/** Scouting tiers cap where a career can get to; see tierForExperience. */
export const MAX_SCOUTING_TIER = 5;

/**
 * Experience buys scouting tier, which sharpens both the draft board
 * (scoutingError in draftClass.ts) and the weekly scouting report
 * (scoutingFuzz in sim/reveal.ts). Pacing: a tier roughly every four
 * seasons, capping out around the same 20 seasons where the read roll's
 * experience advantage maxes out.
 */
export function tierForExperience(experience: number): number {
  return Math.max(0, Math.min(MAX_SCOUTING_TIER, Math.floor(experience / 4)));
}

export function scoutingTier(profile: CoachProfile): number {
  return tierForExperience(profile.experience);
}

/**
 * What one run contributes to a career. Kept as plain data — no session
 * import — so the UI and the save layer can both drive it.
 */
export interface RunLegacy {
  /** The run coach's accumulated experience, including this run's seasons. */
  coachExperience: number;
  /** One entry per completed season, newest last (see runState.SeasonRecord). */
  seasons: { wins: number; losses: number; ties: number; wonChampionship: boolean }[];
}

/**
 * Folds a finished run into the profile. Idempotent on experience (a coach
 * never loses seasons already banked) but the record and championship counts
 * assume the run is folded in exactly once.
 */
export function mergeRunIntoProfile(profile: CoachProfile, run: RunLegacy): CoachProfile {
  const record = run.seasons.reduce<CareerRecord>(
    (acc, season) => ({
      wins: acc.wins + season.wins,
      losses: acc.losses + season.losses,
      ties: acc.ties + season.ties,
    }),
    { wins: 0, losses: 0, ties: 0 },
  );
  const championships = run.seasons.filter((season) => season.wonChampionship).length;

  return {
    name: profile.name,
    experience: Math.max(profile.experience, run.coachExperience),
    careerRecord: {
      wins: profile.careerRecord.wins + record.wins,
      losses: profile.careerRecord.losses + record.losses,
      ties: profile.careerRecord.ties + record.ties,
    },
    championships: profile.championships + championships,
  };
}
