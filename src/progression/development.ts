import type { Player } from "../models/player.js";
import type { Team } from "../models/team.js";
import type { TeamGameStats } from "../sim/gameSim.js";
import {
  computeUnitContributions,
  PASS_DEFENSE,
  PASS_OFFENSE,
  RUSH_DEFENSE,
  RUSH_OFFENSE,
  type UnitSpec,
} from "../sim/units.js";
import { bestAtPosition } from "../sim/units.js";
import type { SchemeId } from "../schemes.js";

/**
 * Development points are earned from expected points added, not from raw
 * yardage. That matters most on defense, which produces no counting stats of
 * its own: a defense earns from the EPA it *denied*, which is exactly the
 * negative of what the opposing offense gained.
 */

/** Points a unit performing at league average earns per game. */
const BASE_POINTS_PER_GAME = 10;

/**
 * Healthy players who did not crack the depth chart still develop, slowly.
 * Without this, backups never improve and a roster has no way to grow its own
 * replacements when a starter ages out or gets hurt.
 */
const BENCH_POINTS_PER_GAME = 2;

/** Development points per expected point above or below that average. */
const EPA_WEIGHT = 1.2;

/**
 * Roughly what each unit produces in a league-average game. Performance is
 * measured against these so an average starter earns the base rate and a unit
 * carrying its team earns more.
 */
const EXPECTED_UNIT_EPA = {
  passOffense: 7,
  rushOffense: 3,
  passDefense: -7,
  rushDefense: -3,
  kicking: 0.5,
} as const;

/**
 * A star carrying a unit should develop faster, but not runaway-faster. The
 * square root compresses the gap: a quarterback is 4.5x his unit's average
 * contributor by raw share, which would leave five linemen splitting one
 * group's weight barely progressing at all.
 */
const MIN_SHARE_MULTIPLIER = 0.7;
const MAX_SHARE_MULTIPLIER = 1.8;

const KICKER_ATTRIBUTES = { kickPower: 0.5, kickAccuracy: 0.5 };
const PUNTER_ATTRIBUTES = { kickPower: 0.6, kickAccuracy: 0.4 };

function unitScore(actualEpa: number, expectedEpa: number): number {
  return Math.max(1, BASE_POINTS_PER_GAME + EPA_WEIGHT * (actualEpa - expectedEpa));
}

function awardUnit(
  roster: Player[],
  spec: UnitSpec,
  scheme: SchemeId,
  score: number,
  award: (player: Player, points: number) => void,
  played: Set<string>,
): void {
  const contributions = computeUnitContributions(roster, spec, scheme);
  if (contributions.length === 0) return;

  const meanShare = 1 / contributions.length;
  for (const { player, share } of contributions) {
    const multiplier = Math.max(
      MIN_SHARE_MULTIPLIER,
      Math.min(MAX_SHARE_MULTIPLIER, Math.sqrt(share / meanShare)),
    );
    award(player, score * multiplier);
    played.add(player.id);
  }
}

/**
 * Hands out development points for one game. Every unit is scored against
 * what an average unit produces, then the score is routed to the players who
 * actually filled that unit.
 */
export function awardDevelopmentPoints(team: Team, stats: TeamGameStats): void {
  const award = (player: Player, points: number) => {
    player.developmentPoints += Math.round(points);
  };
  const played = new Set<string>();

  awardUnit(
    team.roster, PASS_OFFENSE, team.scheme.offense,
    unitScore(stats.passEpa, EXPECTED_UNIT_EPA.passOffense), award, played,
  );
  awardUnit(
    team.roster, RUSH_OFFENSE, team.scheme.offense,
    unitScore(stats.rushEpa, EXPECTED_UNIT_EPA.rushOffense), award, played,
  );
  // These are already stored as the negative of what the opponent gained, so
  // they are compared directly against a negative expectation: a defense that
  // holds an offense to +2 instead of +7 carries -2, which beats -7.
  awardUnit(
    team.roster, PASS_DEFENSE, team.scheme.defense,
    unitScore(stats.passDefenseEpa, EXPECTED_UNIT_EPA.passDefense), award, played,
  );
  awardUnit(
    team.roster, RUSH_DEFENSE, team.scheme.defense,
    unitScore(stats.rushDefenseEpa, EXPECTED_UNIT_EPA.rushDefense), award, played,
  );

  const kicker = bestAtPosition(team.roster, "K", KICKER_ATTRIBUTES);
  if (kicker) {
    award(kicker, unitScore(stats.kickEpa, EXPECTED_UNIT_EPA.kicking));
    played.add(kicker.id);
  }

  const punter = bestAtPosition(team.roster, "P", PUNTER_ATTRIBUTES);
  if (punter) {
    award(punter, BASE_POINTS_PER_GAME * 0.75);
    played.add(punter.id);
  }

  for (const player of team.roster) {
    if (played.has(player.id)) continue;
    if (player.health.status === "career-ending") continue;
    award(player, BENCH_POINTS_PER_GAME);
  }
}
