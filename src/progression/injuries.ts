import { getAttribute, type InjurySeverity, type Player } from "../models/player.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import {
  computeUnitContributions,
  PASS_DEFENSE,
  PASS_OFFENSE,
  RUSH_DEFENSE,
  RUSH_OFFENSE,
} from "../sim/units.js";

/**
 * Injuries are the roguelike's permadeath. A career-ending one removes a
 * player from the franchise for good — there is no reload, and no amount of
 * development points brings him back.
 *
 * They are rolled after a game for the players who actually took the field,
 * rather than per play, which keeps the play engine unaware of health while
 * still tying risk to exposure.
 */

/** Chance a given starter picks up something in a game, before resistance. */
const BASE_INJURY_CHANCE = 0.035;

/** Share of injuries at each severity. Career-enders are rare and permanent. */
const SEVERITY_WEIGHTS: ReadonlyArray<readonly [InjurySeverity, number]> = [
  ["minor", 0.72],
  ["major", 0.25],
  ["career-ending", 0.03],
];

const WEEKS_OUT: Record<InjurySeverity, readonly [number, number]> = {
  minor: [1, 2],
  major: [3, 8],
  "career-ending": [99, 99],
};

const DESCRIPTIONS: Record<InjurySeverity, readonly string[]> = {
  minor: ["bruised ribs", "ankle sprain", "hamstring tightness", "shoulder stinger"],
  major: ["high ankle sprain", "broken hand", "torn hamstring", "fractured rib", "MCL sprain"],
  "career-ending": ["catastrophic knee injury", "spinal injury", "repeated concussions", "shattered ankle"],
};

function pickSeverity(rng: SeededRng): InjurySeverity {
  const roll = rng.next();
  let cumulative = 0;
  for (const [severity, weight] of SEVERITY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return severity;
  }
  return "minor";
}

/** Everyone who took a meaningful snap, deduplicated across units. */
function playersWhoPlayed(team: Team): Player[] {
  const specs = [
    { spec: PASS_OFFENSE, scheme: team.scheme.offense },
    { spec: RUSH_OFFENSE, scheme: team.scheme.offense },
    { spec: PASS_DEFENSE, scheme: team.scheme.defense },
    { spec: RUSH_DEFENSE, scheme: team.scheme.defense },
  ];

  const seen = new Map<string, Player>();
  for (const { spec, scheme } of specs) {
    for (const { player } of computeUnitContributions(team.roster, spec, scheme)) {
      seen.set(player.id, player);
    }
  }
  return [...seen.values()];
}

export interface InjuryEvent {
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  severity: InjurySeverity;
  description: string;
  weeksOut: number;
}

/** Rolls injuries for one team after one game. Mutates the players involved. */
export function rollInjuries(
  team: Team,
  season: number,
  week: number,
  rng: SeededRng,
): InjuryEvent[] {
  const events: InjuryEvent[] = [];

  for (const player of playersWhoPlayed(team)) {
    if (player.health.status === "career-ending") continue;

    // Durable players get hurt less; the attribute is otherwise inert.
    const resistance = getAttribute(player, "injuryResistance") ?? 60;
    const chance = BASE_INJURY_CHANCE * (1.6 - resistance / 100);
    if (!rng.chance(Math.max(0.004, chance))) continue;

    const severity = pickSeverity(rng);
    const [minWeeks, maxWeeks] = WEEKS_OUT[severity];
    const weeksOut = rng.int(minWeeks, maxWeeks);
    const description = rng.pick(DESCRIPTIONS[severity]);

    player.health.injuryHistory.push({ season, week, description, severity, weeksOut });

    if (severity === "career-ending") {
      player.health.status = "career-ending";
      player.health.weeksOut = weeksOut;
    } else {
      player.health.status = "out";
      player.health.weeksOut = Math.max(player.health.weeksOut, weeksOut);
    }

    events.push({
      playerId: player.id,
      playerName: player.name,
      teamId: team.id,
      position: player.position,
      severity,
      description,
      weeksOut,
    });
  }

  return events;
}

/** Advances recovery by one week for a whole roster. */
export function advanceRecovery(team: Team): void {
  for (const player of team.roster) {
    if (player.health.status === "career-ending") continue;
    if (player.health.weeksOut <= 0) continue;

    player.health.weeksOut -= 1;
    if (player.health.weeksOut <= 0) {
      player.health.weeksOut = 0;
      player.health.status = "healthy";
    }
  }
}

/** Career-ending injuries are permanent; this clears everything else. */
export function healOffseason(team: Team): void {
  for (const player of team.roster) {
    if (player.health.status === "career-ending") continue;
    player.health.status = "healthy";
    player.health.weeksOut = 0;
  }
}

/** Players lost for good, for the UI to report and for roster cleanup. */
export function retiredThroughInjury(team: Team): Player[] {
  return team.roster.filter((p) => p.health.status === "career-ending");
}
