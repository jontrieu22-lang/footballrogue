import { generateDraftClass, type DraftClass } from "../draft/draftClass.js";
import {
  isDraftComplete,
  makePick,
  runDraftUntil,
  startDraft,
  teamOnTheClock,
  type DraftPickRecord,
  type DraftState,
} from "../draft/draft.js";
import { generateLeague } from "../generators/leagueGenerator.js";
import type { League } from "../models/league.js";
import type { Team } from "../models/team.js";
import { advanceRecovery, rollInjuries, type InjuryEvent } from "../progression/injuries.js";
import { awardDevelopmentPoints } from "../progression/development.js";
import { developTeam } from "../progression/aiDevelopment.js";
import { SeededRng } from "../rng.js";
import { simulateGame, type GameResult } from "../sim/gameSim.js";
import { simulatePlayoffs, type PlayoffResult } from "../sim/playoffs.js";
import { scheduleSeason } from "../sim/season.js";
import { computeStandings, type StandingsRow } from "../sim/standings.js";
import {
  advanceOffseason,
  createFranchise,
  reviewSeason,
  type FranchiseState,
  type SeasonReview,
} from "./runState.js";

export const REGULAR_SEASON_WEEKS = 17;

export type Phase = "regularSeason" | "playoffs" | "draft" | "offseason" | "runOver";

export interface WeekResult {
  week: number;
  games: GameResult[];
  injuries: InjuryEvent[];
  yourGame?: GameResult;
  yourOpponentName?: string;
  youWon?: boolean;
}

/**
 * One in-progress run. Everything the UI needs to render and drive a franchise
 * lives here, and every method is a plain function call so the front end never
 * has to know how the sim works.
 */
export interface GameSession {
  seed: number;
  league: League;
  franchise: FranchiseState;
  phase: Phase;
  week: number;
  weekLog: WeekResult[];
  playoffs?: PlayoffResult;
  seasonReview?: SeasonReview;
  draft?: DraftState;
  draftClass?: DraftClass;
  /** Advanced deliberately so a reloaded save continues the same sequence. */
  rngCursor: number;
}

function rngFor(session: GameSession, salt: number): SeededRng {
  return new SeededRng(session.seed * 31 + salt);
}

export function createSession(seed: number, teamId?: string, numTeams = 32): GameSession {
  const rng = new SeededRng(seed);
  const league = generateLeague(rng, numTeams);
  scheduleSeason(league, REGULAR_SEASON_WEEKS);

  const chosen = teamId ?? league.teams[0]?.id ?? "";
  return {
    seed,
    league,
    franchise: createFranchise(chosen, league.season),
    phase: "regularSeason",
    week: 1,
    weekLog: [],
    rngCursor: 0,
  };
}

export function yourTeam(session: GameSession): Team {
  const team = session.league.teams.find((t) => t.id === session.franchise.teamId);
  if (!team) throw new Error("Franchise team is not in the league");
  return team;
}

export function standings(session: GameSession): StandingsRow[] {
  return computeStandings(session.league.teams);
}

function applyResult(home: Team, away: Team, result: GameResult): void {
  home.pointsFor += result.home.points;
  home.pointsAgainst += result.away.points;
  away.pointsFor += result.away.points;
  away.pointsAgainst += result.home.points;

  if (result.home.points > result.away.points) {
    home.record.wins += 1;
    away.record.losses += 1;
  } else if (result.home.points < result.away.points) {
    away.record.wins += 1;
    home.record.losses += 1;
  } else {
    home.record.ties += 1;
    away.record.ties += 1;
  }
}

/**
 * Plays one week: every scheduled game, injuries for the teams that played,
 * development points, then recovery. AI teams spend their points immediately;
 * yours are left for you.
 */
export function playWeek(session: GameSession): WeekResult {
  if (session.phase !== "regularSeason") {
    throw new Error(`Cannot play a week during the ${session.phase} phase`);
  }

  const rng = rngFor(session, session.rngCursor++);
  const teamsById = new Map(session.league.teams.map((t) => [t.id, t]));
  const fixtures = session.league.schedule.filter((g) => g.week === session.week);

  const games: GameResult[] = [];
  const injuries: InjuryEvent[] = [];
  let yourGame: GameResult | undefined;
  let yourOpponentName: string | undefined;
  let youWon: boolean | undefined;

  for (const fixture of fixtures) {
    const home = teamsById.get(fixture.homeTeamId);
    const away = teamsById.get(fixture.awayTeamId);
    if (!home || !away) continue;

    const result = simulateGame(home, away, rng);
    games.push(result);
    applyResult(home, away, result);

    awardDevelopmentPoints(home, result.home);
    awardDevelopmentPoints(away, result.away);

    injuries.push(...rollInjuries(home, session.league.season, session.week, rng));
    injuries.push(...rollInjuries(away, session.league.season, session.week, rng));

    if (home.id === session.franchise.teamId || away.id === session.franchise.teamId) {
      const youAreHome = home.id === session.franchise.teamId;
      yourGame = result;
      yourOpponentName = youAreHome ? away.name : home.name;
      const yourPoints = youAreHome ? result.home.points : result.away.points;
      const theirPoints = youAreHome ? result.away.points : result.home.points;
      youWon = yourPoints > theirPoints;
    }
  }

  for (const team of session.league.teams) {
    advanceRecovery(team);
    if (team.id !== session.franchise.teamId) developTeam(team);
  }

  const weekResult: WeekResult = {
    week: session.week,
    games,
    injuries,
    ...(yourGame && { yourGame, yourOpponentName, youWon }),
  };
  session.weekLog.push(weekResult);

  session.week += 1;
  if (session.week > REGULAR_SEASON_WEEKS) session.phase = "playoffs";

  return weekResult;
}

/** Runs the postseason and grades your year. */
export function playPlayoffs(session: GameSession): PlayoffResult {
  if (session.phase !== "playoffs") {
    throw new Error(`Cannot play the postseason during the ${session.phase} phase`);
  }

  const rng = rngFor(session, session.rngCursor++);
  const result = simulatePlayoffs(session.league, rng);
  session.playoffs = result;

  const review = reviewSeason(session.franchise, yourTeam(session), session.league, result.championId);
  session.seasonReview = review;
  session.phase = review.outcome === "fired" ? "runOver" : "draft";

  return result;
}

/**
 * Ages the league, retires the old and the broken, generates a class, and runs
 * the draft up to your first pick.
 */
export function beginDraft(session: GameSession): DraftState {
  if (session.phase !== "draft") {
    throw new Error(`Cannot start the draft during the ${session.phase} phase`);
  }

  const rng = rngFor(session, session.rngCursor++);
  const draftClass = generateDraftClass(rng, session.league.season + 1, session.franchise.scoutingTier);
  const state = startDraft(session.league, draftClass);

  session.draftClass = draftClass;
  session.draft = state;
  runDraftUntil(session.league, state, session.franchise.teamId);
  return state;
}

export function yourPickIsUp(session: GameSession): boolean {
  const state = session.draft;
  if (!state || isDraftComplete(state)) return false;
  return teamOnTheClock(state) === session.franchise.teamId;
}

/** Makes your selection, then advances the AI until you are back on the clock. */
export function draftPlayer(session: GameSession, playerId: string): DraftPickRecord | undefined {
  const state = session.draft;
  if (!state || !yourPickIsUp(session)) return undefined;

  const record = makePick(session.league, state, playerId);
  if (!record) return undefined;

  runDraftUntil(session.league, state, session.franchise.teamId);
  return record;
}

/** Lets the AI make your remaining picks — the "auto-draft" button. */
export function finishDraft(session: GameSession): void {
  const state = session.draft;
  if (!state) return;
  while (!isDraftComplete(state)) {
    if (yourPickIsUp(session)) {
      const team = yourTeam(session);
      const prospect = state.available[0];
      if (!prospect) break;
      makePick(session.league, state, prospect.player.id);
      void team;
    }
    runDraftUntil(session.league, state, session.franchise.teamId);
    if (yourPickIsUp(session) && isDraftComplete(state)) break;
  }
}

/** Closes the offseason and starts the next season. */
export function startNextSeason(session: GameSession): void {
  if (session.phase !== "draft" && session.phase !== "offseason") {
    throw new Error(`Cannot start a season during the ${session.phase} phase`);
  }

  const rng = rngFor(session, session.rngCursor++);
  advanceOffseason(session.league, rng);
  scheduleSeason(session.league, REGULAR_SEASON_WEEKS);

  session.franchise.season = session.league.season;
  session.week = 1;
  session.weekLog = [];
  session.phase = "regularSeason";
  delete session.playoffs;
  delete session.seasonReview;
  delete session.draft;
  delete session.draftClass;
}
