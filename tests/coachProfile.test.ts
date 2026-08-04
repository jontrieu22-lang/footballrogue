import { describe, expect, it } from "vitest";
import {
  createCoachProfile,
  MAX_SCOUTING_TIER,
  mergeRunIntoProfile,
  scoutingTier,
  tierForExperience,
  type CoachProfile,
} from "../src/franchise/coachProfile.js";

describe("tierForExperience", () => {
  it("starts at zero and climbs one tier roughly every four seasons", () => {
    expect(tierForExperience(0)).toBe(0);
    expect(tierForExperience(3)).toBe(0);
    expect(tierForExperience(4)).toBe(1);
    expect(tierForExperience(7)).toBe(1);
    expect(tierForExperience(8)).toBe(2);
    expect(tierForExperience(12)).toBe(3);
  });

  it("caps at the maximum tier", () => {
    expect(tierForExperience(20)).toBe(MAX_SCOUTING_TIER);
    expect(tierForExperience(999)).toBe(MAX_SCOUTING_TIER);
  });
});

describe("mergeRunIntoProfile", () => {
  it("preserves career experience when the run ends (firing carries it over)", () => {
    const profile: CoachProfile = createCoachProfile("Maya Reed");
    profile.experience = 6;

    const merged = mergeRunIntoProfile(profile, {
      coachExperience: 9, // the run coach started at 6 and coached 3 more seasons
      seasons: [
        { wins: 7, losses: 10, ties: 0, wonChampionship: false },
        { wins: 12, losses: 5, ties: 0, wonChampionship: false },
        { wins: 14, losses: 3, ties: 0, wonChampionship: true },
      ],
    });

    expect(merged.experience).toBe(9);
    expect(merged.careerRecord).toEqual({ wins: 33, losses: 18, ties: 0 });
    expect(merged.championships).toBe(1);
    expect(merged.name).toBe("Maya Reed");
  });

  it("never loses seasons already banked, even on a partial or empty run", () => {
    const profile = createCoachProfile("Coach");
    profile.experience = 12;

    const merged = mergeRunIntoProfile(profile, { coachExperience: 12, seasons: [] });
    expect(merged.experience).toBe(12);
    expect(merged.careerRecord).toEqual({ wins: 0, losses: 0, ties: 0 });
    expect(merged.championships).toBe(0);
  });

  it("accumulates across runs", () => {
    const profile = createCoachProfile("Coach");
    const first = mergeRunIntoProfile(profile, {
      coachExperience: 2,
      seasons: [
        { wins: 8, losses: 9, ties: 0, wonChampionship: false },
        { wins: 13, losses: 4, ties: 0, wonChampionship: true },
      ],
    });
    const second = mergeRunIntoProfile(first, {
      coachExperience: 4,
      seasons: [{ wins: 5, losses: 12, ties: 0, wonChampionship: false }],
    });

    expect(second.experience).toBe(4);
    expect(second.careerRecord).toEqual({ wins: 26, losses: 25, ties: 0 });
    expect(second.championships).toBe(1);
    expect(scoutingTier(second)).toBe(tierForExperience(4));
  });
});
