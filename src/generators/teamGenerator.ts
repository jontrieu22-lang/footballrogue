import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import type { Position } from "../types.js";
import {
  DEFENSE_POSITIONS,
  DEFENSE_SCHEMES,
  OFFENSE_POSITIONS,
  OFFENSE_SCHEMES,
} from "../schemes.js";
import { generateCoach } from "./coachGenerator.js";
import { generatePlayerName, generateTeamName } from "./names.js";
import { generatePlayer } from "./playerGenerator.js";
import { initialFamiliarity } from "../progression/familiarity.js";

/** Roster composition — 52 players, roughly mirroring a real NFL roster's position mix. */
const ROSTER_COMPOSITION: Record<Position, number> = {
  QB: 3,
  RB: 4,
  WR: 6,
  TE: 3,
  OL: 9,
  DL: 8,
  LB: 7,
  CB: 6,
  S: 4,
  K: 1,
  P: 1,
};

const STARTING_FRANCHISE_POINTS = 100;

let nextTeamId = 1;

export function resetTeamIdCounter(): void {
  nextTeamId = 1;
}

/** Next team id — persisted alongside the player cursor (see save.ts). */
export function getTeamIdCounter(): number {
  return nextTeamId;
}

export function setTeamIdCounter(cursor: number): void {
  nextTeamId = cursor;
}

export interface GenerateTeamOptions {
  /** Shifts the whole roster's quality — the difference between a contender and a rebuild. */
  qualityBias?: number;
  /** Extra quality for offensive positions only. */
  offenseBias?: number;
  /** Extra quality for defensive positions only. */
  defenseBias?: number;
}

export function generateTeam(rng: SeededRng, options: GenerateTeamOptions = {}): Team {
  const { qualityBias = 0, offenseBias = 0, defenseBias = 0 } = options;

  const biasFor = (position: Position): number => {
    if (OFFENSE_POSITIONS.includes(position)) return qualityBias + offenseBias;
    if (DEFENSE_POSITIONS.includes(position)) return qualityBias + defenseBias;
    return qualityBias;
  };

  const roster = [];
  for (const [position, count] of Object.entries(ROSTER_COMPOSITION) as [Position, number][]) {
    for (let i = 0; i < count; i++) {
      roster.push(
        generatePlayer(position, rng, generatePlayerName(rng), {
          qualityBias: biasFor(position),
        }),
      );
    }
  }

  const id = `t${nextTeamId++}`;
  // Draw order matters: the name precedes the scheme picks, matching the
  // pre-familiarity stream so seeded leagues (and sanity's baselines) are
  // unchanged. Familiarity is derived from the scheme afterwards.
  const name = generateTeamName(rng);
  const offense = rng.pick(OFFENSE_SCHEMES);
  const defense = rng.pick(DEFENSE_SCHEMES);
  return {
    id,
    name,
    roster,
    scheme: { offense, defense },
    coach: generateCoach(id),
    familiarity: initialFamiliarity(offense, defense),
    franchisePoints: STARTING_FRANCHISE_POINTS,
    draftPicks: [],
    record: { wins: 0, losses: 0, ties: 0 },
    pointsFor: 0,
    pointsAgainst: 0,
  };
}
