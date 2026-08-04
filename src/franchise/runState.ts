import type { League } from "../models/league.js";
import { computeOverall, type Player } from "../models/player.js";
import type { Team } from "../models/team.js";
import type { SeededRng } from "../rng.js";
import { healOffseason } from "../progression/injuries.js";
import { schemeForPosition } from "../schemes.js";
import { PLAYOFF_TEAMS } from "../sim/playoffs.js";
import { computeStandings } from "../sim/standings.js";

/**
 * The roguelike frame. A season is a run; ownership's patience is the health
 * bar. Miss expectations and it drains, and at zero the run ends — that is the
 * failure state a roguelike needs, and it is what makes a bad draft or a
 * career-ending injury actually cost something.
 */

export const STARTING_PATIENCE = 3;
export const MAX_PATIENCE = 5;

/** Wins ownership expects, before adjusting for how the franchise has been doing. */
const BASELINE_EXPECTED_WINS = 8;

/** Ownership never asks for less than this, however far the franchise has fallen. */
const MINIMUM_EXPECTED_WINS = 7;

export type RunOutcome = "continue" | "fired";

export interface SeasonRecord {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  madePlayoffs: boolean;
  wonChampionship: boolean;
  expectedWins: number;
  patienceAfter: number;
}

export interface FranchiseState {
  teamId: string;
  season: number;
  patience: number;
  /** Rises with success; raises what ownership expects next year. */
  reputation: number;
  scoutingTier: number;
  /** Whether this season's one mid-season scheme re-fit has been used. */
  schemeSwitchUsed: boolean;
  history: SeasonRecord[];
  status: "active" | "fired";
  /** Set when the run ends, for the summary screen. */
  endReason?: string;
}

export function createFranchise(teamId: string, season = 1): FranchiseState {
  return {
    teamId,
    season,
    patience: STARTING_PATIENCE,
    reputation: 0,
    scoutingTier: 0,
    schemeSwitchUsed: false,
    history: [],
    status: "active",
  };
}

/**
 * What ownership wants this year. Success raises the bar — winning does not
 * buy permanent safety, which is what stops a strong franchise from coasting.
 */
export function expectedWins(franchise: FranchiseState): number {
  // The floor matters: set it too low and a failing franchise "meets
  // expectations" at 5-12 forever, so the run never ends and the roguelike
  // loses its failure state entirely.
  return Math.round(
    Math.max(MINIMUM_EXPECTED_WINS, Math.min(12, BASELINE_EXPECTED_WINS + franchise.reputation * 0.6)),
  );
}

export interface SeasonReview {
  record: SeasonRecord;
  outcome: RunOutcome;
  message: string;
}

/**
 * Grades the season and updates patience. Making the playoffs or beating the
 * win target buys goodwill; falling short spends it.
 */
export function reviewSeason(
  franchise: FranchiseState,
  team: Team,
  league: League,
  championId: string | undefined,
): SeasonReview {
  const standings = computeStandings(league.teams);
  const position = standings.findIndex((row) => row.teamId === team.id);
  const madePlayoffs = position >= 0 && position < Math.min(PLAYOFF_TEAMS, standings.length);
  const wonChampionship = championId === team.id;

  const target = expectedWins(franchise);
  const { wins, losses, ties } = team.record;

  let patienceChange = 0;
  let message: string;

  if (wonChampionship) {
    patienceChange = 2;
    message = "Champions. Ownership will hear anything you ask for.";
  } else if (madePlayoffs && wins >= target) {
    patienceChange = 1;
    message = "A playoff season that beat expectations. The seat is cold.";
  } else if (madePlayoffs) {
    patienceChange = 0;
    message = "You made the postseason, which was enough to hold the line.";
  } else if (wins >= target) {
    patienceChange = 0;
    message = "You hit the win target but missed the playoffs. Ownership noticed both.";
  } else if (wins >= target - 3) {
    patienceChange = -1;
    message = "Short of the target and out of the playoffs. Patience is thinning.";
  } else {
    patienceChange = -2;
    message = "A season well below what was asked. Ownership is openly unhappy.";
  }

  franchise.patience = Math.max(0, Math.min(MAX_PATIENCE, franchise.patience + patienceChange));

  // Reputation tracks results over time and drives next year's target.
  const reputationChange = (wonChampionship ? 3 : madePlayoffs ? 1 : -1) + (wins - target) * 0.15;
  franchise.reputation = Math.max(-5, Math.min(10, franchise.reputation + reputationChange));

  const record: SeasonRecord = {
    season: franchise.season,
    wins,
    losses,
    ties,
    madePlayoffs,
    wonChampionship,
    expectedWins: target,
    patienceAfter: franchise.patience,
  };
  franchise.history.push(record);

  const outcome: RunOutcome = franchise.patience <= 0 ? "fired" : "continue";
  if (outcome === "fired") {
    franchise.status = "fired";
    franchise.endReason = `Fired after ${franchise.history.length} season${
      franchise.history.length === 1 ? "" : "s"
    } — ${wins}-${losses}-${ties} against a target of ${target}.`;
    message = `${message} You have been relieved of your duties.`;
  }

  return { record, outcome, message };
}

/** Age gain per offseason, and when decline sets in. */
const DECLINE_AGE = 29;
const RETIREMENT_AGE = 38;

function ageAttributes(player: Player, rng: SeededRng): void {
  player.age += 1;
  if (player.age < DECLINE_AGE) return;

  // Physical traits go first; the mental side holds up longer.
  const decline = Math.min(6, Math.round((player.age - DECLINE_AGE) * 0.8 + rng.float(0, 1.5)));
  for (const key of ["speed", "acceleration", "agility", "strength"] as const) {
    player.general[key] = Math.max(20, player.general[key] - decline);
  }
  if (player.age > DECLINE_AGE + 3) {
    player.general.stamina = Math.max(20, player.general.stamina - Math.round(decline / 2));
  }
  // Experience keeps accruing even as the body goes.
  player.general.awareness = Math.min(99, player.general.awareness + 1);
}

export interface OffseasonReport {
  retired: { playerId: string; playerName: string; position: string; reason: string }[];
  cut: { playerId: string; playerName: string; position: string; teamId: string }[];
}

/** Players a team may carry into a season. */
export const ROSTER_LIMIT = 53;

/**
 * Trims a roster to the limit, dropping the least valuable players *in the
 * scheme they play*, but never cutting below the depth a position needs — a
 * team that trimmed purely on rating would end up without a punter.
 */
export function trimRoster(team: Team): Player[] {
  if (team.roster.length <= ROSTER_LIMIT) return [];

  const minimums: Partial<Record<Player["position"], number>> = {
    QB: 2, RB: 2, WR: 4, TE: 2, OL: 7, DL: 6, LB: 5, CB: 4, S: 3, K: 1, P: 1,
  };

  const ranked = [...team.roster].sort((a, b) => {
    const schemeA = schemeForPosition(a.position, team.scheme);
    const schemeB = schemeForPosition(b.position, team.scheme);
    return computeOverall(b, schemeB) - computeOverall(a, schemeA);
  });

  const kept: Player[] = [];
  const cut: Player[] = [];
  const countByPosition = new Map<string, number>();

  // Fill the minimum at each position first, best available downward.
  for (const player of ranked) {
    const held = countByPosition.get(player.position) ?? 0;
    if (held < (minimums[player.position] ?? 0)) {
      kept.push(player);
      countByPosition.set(player.position, held + 1);
    }
  }

  for (const player of ranked) {
    if (kept.includes(player)) continue;
    if (kept.length < ROSTER_LIMIT) kept.push(player);
    else cut.push(player);
  }

  team.roster = kept;
  return cut;
}

/**
 * Rolls the league into the next season: injuries heal except the permanent
 * ones, players age, and the old and the broken leave the game.
 *
 * `exemptPlayerIds` skips the ageing pass — used for players drafted this very
 * offseason, whose draft-day age is their playing age until next year.
 */
export function advanceOffseason(
  league: League,
  rng: SeededRng,
  exemptPlayerIds?: ReadonlySet<string>,
): OffseasonReport {
  const retired: OffseasonReport["retired"] = [];
  const cut: OffseasonReport["cut"] = [];

  for (const team of league.teams) {
    healOffseason(team);

    const survivors: Player[] = [];
    for (const player of team.roster) {
      if (player.health.status === "career-ending") {
        retired.push({
          playerId: player.id,
          playerName: player.name,
          position: player.position,
          reason: "career-ending injury",
        });
        continue;
      }

      if (exemptPlayerIds?.has(player.id)) {
        survivors.push(player);
        continue;
      }

      ageAttributes(player, rng);

      const oldAge = player.age >= RETIREMENT_AGE;
      const fading = player.age >= 33 && rng.chance((player.age - 32) * 0.18);
      if (oldAge || fading) {
        retired.push({
          playerId: player.id,
          playerName: player.name,
          position: player.position,
          reason: "retirement",
        });
        continue;
      }

      survivors.push(player);
    }

    team.roster = survivors;
    for (const player of trimRoster(team)) {
      cut.push({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        teamId: team.id,
      });
    }
    team.record = { wins: 0, losses: 0, ties: 0 };
    team.pointsFor = 0;
    team.pointsAgainst = 0;
  }

  league.season += 1;
  return { retired, cut };
}
