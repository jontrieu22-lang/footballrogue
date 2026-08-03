import type { League } from "../models/league.js";
import { computeOverall, type Player } from "../models/player.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { schemeForPosition } from "../schemes.js";
import { computeDraftOrder } from "../sim/standings.js";
import type { Position } from "../types.js";
import type { DraftClass, Prospect } from "./draftClass.js";

export const DRAFT_ROUNDS = 5;

/** Roughly how many players a healthy roster wants at each position. */
const TARGET_DEPTH: Record<Position, number> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 8, LB: 7, CB: 6, S: 4, K: 1, P: 1,
};

export interface DraftPickRecord {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: Position;
  scoutedOverall: number;
  trueOverall: number;
}

export interface DraftState {
  season: number;
  /** Team ids in pick order, repeated for each round. */
  order: string[];
  available: Prospect[];
  picks: DraftPickRecord[];
  /** Index into `order`; equals order.length when the draft is done. */
  currentPick: number;
}

/**
 * Draft order is strict reverse standings — worst record picks first, same as
 * the real NFL — repeated for every round.
 */
export function startDraft(league: League, draftClass: DraftClass): DraftState {
  const reverseStandings = computeDraftOrder(league.teams).map((row) => row.teamId);
  const order: string[] = [];
  for (let round = 0; round < DRAFT_ROUNDS; round++) {
    order.push(...reverseStandings);
  }

  return {
    season: draftClass.season,
    order,
    available: [...draftClass.prospects],
    picks: [],
    currentPick: 0,
  };
}

export function isDraftComplete(state: DraftState): boolean {
  return state.currentPick >= state.order.length || state.available.length === 0;
}

export function teamOnTheClock(state: DraftState): string | undefined {
  return state.order[state.currentPick];
}

function countAtPosition(team: Team, position: Position): number {
  return team.roster.filter(
    (p) => p.position === position && p.health.status !== "career-ending",
  ).length;
}

/**
 * How badly a team wants this prospect: what scouting thinks he is worth, how
 * thin the roster is at his position, and how well he suits the scheme they
 * run there.
 */
export function prospectValueFor(team: Team, prospect: Prospect): number {
  const { scoutedOverall, scoutedPotential, player } = prospect;
  const base = scoutedOverall + scoutedPotential * 0.7;

  const depth = countAtPosition(team, player.position);
  const target = TARGET_DEPTH[player.position];
  // Thin spots are worth a real premium; a full room is worth a discount.
  const needFactor = depth >= target ? 0.82 : 1 + (target - depth) * 0.08;

  const scheme = schemeForPosition(player.position, team.scheme);
  const schemeFit = scheme ? computeOverall(player, scheme) - computeOverall(player) : 0;

  return base * needFactor + schemeFit * 1.5;
}

/** The pick an AI team would make right now. */
export function bestAvailableFor(team: Team, state: DraftState): Prospect | undefined {
  let best: Prospect | undefined;
  let bestValue = -Infinity;
  // Only the top of the board is realistically in play, which keeps late
  // rounds from becoming a global optimisation.
  for (const prospect of state.available.slice(0, 24)) {
    const value = prospectValueFor(team, prospect);
    if (value > bestValue) {
      bestValue = value;
      best = prospect;
    }
  }
  return best;
}

function recordPick(state: DraftState, team: Team, prospect: Prospect): DraftPickRecord {
  const index = state.currentPick;
  const teamCount = state.order.length / DRAFT_ROUNDS;
  const record: DraftPickRecord = {
    overall: index + 1,
    round: Math.floor(index / teamCount) + 1,
    pickInRound: (index % teamCount) + 1,
    teamId: team.id,
    teamName: team.name,
    playerId: prospect.player.id,
    playerName: prospect.player.name,
    position: prospect.player.position,
    scoutedOverall: prospect.scoutedOverall,
    trueOverall: computeOverall(prospect.player),
  };

  team.roster.push(prospect.player);
  state.available = state.available.filter((p) => p.player.id !== prospect.player.id);
  state.picks.push(record);
  state.currentPick += 1;
  return record;
}

/** Makes a specific selection — the human team's pick. */
export function makePick(
  league: League,
  state: DraftState,
  playerId: string,
): DraftPickRecord | undefined {
  const teamId = teamOnTheClock(state);
  const team = league.teams.find((t) => t.id === teamId);
  const prospect = state.available.find((p) => p.player.id === playerId);
  if (!team || !prospect) return undefined;
  return recordPick(state, team, prospect);
}

/** Advances the draft until the given team is on the clock, or it ends. */
export function runDraftUntil(
  league: League,
  state: DraftState,
  stopAtTeamId: string | undefined,
): DraftPickRecord[] {
  const made: DraftPickRecord[] = [];

  while (!isDraftComplete(state)) {
    const teamId = teamOnTheClock(state);
    if (teamId === stopAtTeamId) break;

    const team = league.teams.find((t) => t.id === teamId);
    if (!team) {
      state.currentPick += 1;
      continue;
    }

    const prospect = bestAvailableFor(team, state);
    if (!prospect) break;
    made.push(recordPick(state, team, prospect));
  }

  return made;
}

/** Runs the whole draft with no human involvement. */
export function runFullDraft(league: League, state: DraftState, rng?: SeededRng): DraftPickRecord[] {
  void rng;
  return runDraftUntil(league, state, undefined);
}

/** Undrafted prospects, available to fill out thin rosters. */
export function undraftedPool(state: DraftState): Player[] {
  return state.available.map((p) => p.player);
}
