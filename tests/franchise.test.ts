import { describe, expect, it } from "vitest";
import {
  beginDraft,
  createSession,
  finishDraft,
  midseasonSwitchAvailable,
  playPlayoffs,
  playWeek,
  setTeamScheme,
  startNextSeason,
  startSeason,
  switchSchemeMidseason,
  yourTeam,
  REGULAR_SEASON_WEEKS,
  type GameSession,
} from "../src/franchise/game.js";
import {
  advanceOffseason,
  createFranchise,
  expectedWins,
  reviewSeason,
  trimRoster,
  ROSTER_LIMIT,
  STARTING_PATIENCE,
} from "../src/franchise/runState.js";
import { deserializeSession, serializeSession } from "../src/franchise/save.js";
import { generateDraftClass, scoutingError } from "../src/draft/draftClass.js";
import { startDraft, runFullDraft, DRAFT_ROUNDS } from "../src/draft/draft.js";
import { simulatePlayoffs, PLAYOFF_TEAMS } from "../src/sim/playoffs.js";
import { rollInjuries, advanceRecovery, healOffseason } from "../src/progression/injuries.js";
import { generateLeague } from "../src/generators/leagueGenerator.js";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { computeSchemeMatrix, computeTeamUnits } from "../src/sim/units.js";
import { SeededRng } from "../src/rng.js";
import { scheduleSeason, simulateSeason } from "../src/sim/season.js";
import { computeOverall } from "../src/models/player.js";

function fresh() {
  resetPlayerIdCounter();
  resetTeamIdCounter();
}

describe("playoffs", () => {
  it("crowns exactly one champion from the top seeds", () => {
    fresh();
    const rng = new SeededRng(4);
    const league = generateLeague(rng, 32);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    const result = simulatePlayoffs(league, rng);
    expect(result.seeds).toHaveLength(PLAYOFF_TEAMS);
    expect(result.championId).toBeTruthy();
    expect(result.seeds.some((s) => s.teamId === result.championId)).toBe(true);
    expect(result.games.length).toBeGreaterThan(0);
  });

  it("never lets a playoff game end level", () => {
    fresh();
    const rng = new SeededRng(6);
    const league = generateLeague(rng, 32);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    for (const game of simulatePlayoffs(league, rng).games) {
      expect(game.result.home.points).not.toBe(game.result.away.points);
      expect([game.homeTeamId, game.awayTeamId]).toContain(game.winnerId);
    }
  });

  it("works for a small league without breaking the bracket", () => {
    fresh();
    const rng = new SeededRng(8);
    const league = generateLeague(rng, 6);
    scheduleSeason(league, 5);
    simulateSeason(league, rng);
    expect(simulatePlayoffs(league, rng).championId).toBeTruthy();
  });
});

describe("injuries", () => {
  it("sidelines players and heals them over following weeks", () => {
    fresh();
    const team = generateTeam(new SeededRng(3));
    const rng = new SeededRng(99);

    let events: ReturnType<typeof rollInjuries> = [];
    for (let attempt = 0; attempt < 200 && events.length === 0; attempt++) {
      events = rollInjuries(team, 1, attempt + 1, rng);
    }
    expect(events.length).toBeGreaterThan(0);

    const hurt = team.roster.find((p) => p.id === events[0]?.playerId);
    expect(hurt).toBeDefined();
    expect(hurt?.health.status).not.toBe("healthy");
    expect(hurt?.health.injuryHistory.length).toBeGreaterThan(0);

    if (hurt && hurt.health.status !== "career-ending") {
      for (let week = 0; week < 20; week++) advanceRecovery(team);
      expect(hurt.health.status).toBe("healthy");
      expect(hurt.health.weeksOut).toBe(0);
    }
  });

  it("never heals a career-ending injury", () => {
    fresh();
    const team = generateTeam(new SeededRng(3));
    const player = team.roster[0];
    expect(player).toBeDefined();
    if (!player) return;

    player.health.status = "career-ending";
    player.health.weeksOut = 99;

    for (let week = 0; week < 40; week++) advanceRecovery(team);
    healOffseason(team);
    expect(player.health.status).toBe("career-ending");
  });

  it("removes career-ending injuries from the roster in the offseason", () => {
    fresh();
    const rng = new SeededRng(11);
    const league = generateLeague(rng, 4);
    const team = league.teams[0];
    expect(team).toBeDefined();
    if (!team) return;

    const doomed = team.roster[0];
    if (!doomed) return;
    doomed.health.status = "career-ending";

    const report = advanceOffseason(league, rng);
    expect(team.roster.some((p) => p.id === doomed.id)).toBe(false);
    expect(report.retired.some((r) => r.playerId === doomed.id)).toBe(true);
  });
});

describe("draft", () => {
  it("gives every team the same number of picks in reverse standings order", () => {
    fresh();
    const rng = new SeededRng(13);
    const league = generateLeague(rng, 32);
    scheduleSeason(league, 17);
    simulateSeason(league, rng);

    const draftClass = generateDraftClass(rng, 2);
    const state = startDraft(league, draftClass);
    expect(state.order).toHaveLength(32 * DRAFT_ROUNDS);

    // Worst record picks first.
    const sorted = [...league.teams].sort((a, b) => a.record.wins - b.record.wins);
    expect(state.order[0]).toBe(sorted[0]?.id);

    const picks = runFullDraft(league, state);
    expect(picks).toHaveLength(32 * DRAFT_ROUNDS);

    const perTeam = new Map<string, number>();
    for (const pick of picks) perTeam.set(pick.teamId, (perTeam.get(pick.teamId) ?? 0) + 1);
    for (const count of perTeam.values()) expect(count).toBe(DRAFT_ROUNDS);
  });

  it("puts drafted players onto the roster and takes them off the board", () => {
    fresh();
    const rng = new SeededRng(15);
    const league = generateLeague(rng, 8);
    scheduleSeason(league, 9);
    simulateSeason(league, rng);

    const before = new Map(league.teams.map((t) => [t.id, t.roster.length]));
    const state = startDraft(league, generateDraftClass(rng, 2));
    const available = state.available.length;
    const picks = runFullDraft(league, state);

    expect(state.available).toHaveLength(available - picks.length);
    for (const team of league.teams) {
      expect(team.roster.length).toBe((before.get(team.id) ?? 0) + DRAFT_ROUNDS);
    }
  });

  it("scouts prospects imperfectly, and better with a higher tier", () => {
    fresh();
    const spreadOf = (tier: number) => {
      const draftClass = generateDraftClass(new SeededRng(21), 2, tier);
      const errors = draftClass.prospects.map((p) =>
        Math.abs(p.scoutedOverall - computeOverall(p.player)),
      );
      return errors.reduce((sum, e) => sum + e, 0) / errors.length;
    };

    expect(scoutingError(0)).toBeGreaterThan(scoutingError(4));
    expect(spreadOf(0)).toBeGreaterThan(0);
    expect(spreadOf(4)).toBeLessThan(spreadOf(0));
  });
});

describe("run state", () => {
  it("raises what ownership expects as reputation grows", () => {
    const franchise = createFranchise("t1");
    const base = expectedWins(franchise);
    franchise.reputation = 8;
    expect(expectedWins(franchise)).toBeGreaterThan(base);
  });

  it("never lets the target fall low enough for a losing team to coast", () => {
    const franchise = createFranchise("t1");
    franchise.reputation = -99;
    // Without a floor, a failing franchise "meets expectations" forever and
    // the run has no failure state at all.
    expect(expectedWins(franchise)).toBeGreaterThanOrEqual(7);
  });

  it("ends the run after repeated bad seasons", () => {
    fresh();
    const rng = new SeededRng(31);
    const league = generateLeague(rng, 32);
    const team = league.teams[0];
    expect(team).toBeDefined();
    if (!team) return;

    const franchise = createFranchise(team.id);
    let outcome = "continue";
    let seasons = 0;

    while (outcome === "continue" && seasons < 12) {
      // The rest of the league has to have real records too, or a 2-15 team
      // ranks first among 0-0-0 opponents and counts as a playoff side.
      for (const other of league.teams) {
        other.record = other.id === team.id
          ? { wins: 2, losses: 15, ties: 0 }
          : { wins: 10, losses: 7, ties: 0 };
      }
      outcome = reviewSeason(franchise, team, league, undefined).outcome;
      seasons++;
    }

    expect(outcome).toBe("fired");
    expect(franchise.status).toBe("fired");
    expect(franchise.endReason).toBeTruthy();
    expect(seasons).toBeLessThanOrEqual(STARTING_PATIENCE + 1);
  });

  it("rewards a championship with goodwill", () => {
    fresh();
    const rng = new SeededRng(33);
    const league = generateLeague(rng, 32);
    const team = league.teams[0];
    if (!team) return;

    const franchise = createFranchise(team.id);
    franchise.patience = 1;
    team.record = { wins: 14, losses: 3, ties: 0 };
    const review = reviewSeason(franchise, team, league, team.id);

    expect(review.outcome).toBe("continue");
    expect(franchise.patience).toBeGreaterThan(1);
    expect(review.record.wonChampionship).toBe(true);
  });

  it("ages players and retires the oldest", () => {
    fresh();
    const rng = new SeededRng(37);
    const league = generateLeague(rng, 4);
    const team = league.teams[0];
    if (!team) return;

    const veteran = team.roster[0];
    if (!veteran) return;
    veteran.age = 39;
    const youngster = team.roster.find((p) => p.age < 25);
    const ageBefore = youngster?.age;

    advanceOffseason(league, rng);
    expect(team.roster.some((p) => p.id === veteran.id)).toBe(false);
    if (youngster && ageBefore !== undefined) {
      expect(youngster.age).toBe(ageBefore + 1);
    }
  });

  it("trims an oversized roster without stripping a position bare", () => {
    fresh();
    const rng = new SeededRng(41);
    const team = generateTeam(rng);
    for (let i = 0; i < 15; i++) {
      team.roster.push(generatePlayer("WR", rng, `Extra ${i}`, { qualityBias: -25 }));
    }

    const cut = trimRoster(team);
    expect(team.roster.length).toBe(ROSTER_LIMIT);
    expect(cut.length).toBeGreaterThan(0);
    // Specialists must survive a purely rating-based trim.
    expect(team.roster.some((p) => p.position === "K")).toBe(true);
    expect(team.roster.some((p) => p.position === "P")).toBe(true);
  });
});

describe("preseason and scheme agency", () => {
  it("starts in preseason and lets the player pick the scheme pair before week one", () => {
    fresh();
    const session = createSession(73);
    expect(session.phase).toBe("preseason");
    expect(() => playWeek(session)).toThrow();

    const team = yourTeam(session);
    setTeamScheme(session, "airRaid", "blitzMan");
    expect(team.scheme).toEqual({ offense: "airRaid", defense: "blitzMan" });

    startSeason(session);
    expect(session.phase).toBe("regularSeason");
    expect(() => playWeek(session)).not.toThrow();
  });

  it("rates the roster in every scheme combination, current pair included", () => {
    fresh();
    const session = createSession(71);
    const team = yourTeam(session);
    const rows = computeSchemeMatrix(team);

    expect(rows).toHaveLength(16);
    const current = rows.find(
      (row) => row.offense === team.scheme.offense && row.defense === team.scheme.defense,
    );
    expect(current).toBeDefined();

    // The current cell must agree with the unit ratings the sim actually uses,
    // or the matrix is lying about the roster's real value.
    const units = computeTeamUnits(team);
    expect(current?.passOffense).toBeCloseTo(units.passOffense, 5);
    expect(current?.rushDefense).toBeCloseTo(units.rushDefense, 5);

    const best = rows.reduce((a, b) => (b.rating > a.rating ? b : a));
    expect(best.rating).toBeGreaterThanOrEqual(current?.rating ?? 0);
  });

  it("charges one patience for a mid-season scheme switch, once per season", () => {
    fresh();
    const session = createSession(77);
    startSeason(session);
    const before = session.franchise.patience;
    expect(midseasonSwitchAvailable(session)).toBe(true);

    switchSchemeMidseason(session, "westCoast", "cover2Zone");
    expect(yourTeam(session).scheme).toEqual({ offense: "westCoast", defense: "cover2Zone" });
    expect(session.franchise.patience).toBe(before - 1);
    expect(session.franchise.schemeSwitchUsed).toBe(true);
    expect(midseasonSwitchAvailable(session)).toBe(false);
    expect(() => switchSchemeMidseason(session, "rpo", "base43")).toThrow();

    // The next season reopens the window.
    session.phase = "draft";
    startNextSeason(session);
    expect(midseasonSwitchAvailable(session)).toBe(true);
  });
});

describe("id integrity", () => {
  function collectIds(session: GameSession): string[] {
    const ids: string[] = [];
    for (const team of session.league.teams) {
      for (const player of team.roster) ids.push(player.id);
    }
    // The draft class keeps every prospect, picked or not; the unpicked pool is
    // the ones not already sitting on a roster.
    for (const prospect of session.draft?.available ?? []) ids.push(prospect.player.id);
    return ids;
  }

  it("resumes minting after a reload instead of duplicating ids", () => {
    fresh();
    const session = createSession(61);
    session.phase = "draft";
    beginDraft(session);
    const before = collectIds(session);
    expect(new Set(before).size).toBe(before.length);

    // A fresh page restarts the module counters at 1 while the run persists —
    // exactly the state that used to mint duplicate ids on the next draft.
    const restored = deserializeSession(serializeSession(session));
    resetPlayerIdCounter();
    resetTeamIdCounter();
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    const restoredSession = restored.session;
    delete restoredSession.draft;
    delete restoredSession.draftClass;
    beginDraft(restoredSession);

    // The restored run now carries veterans, the first draft's picks, and the
    // second class — every id must be unique, which the stored cursor is what
    // guarantees. Without it the reset counter would mint p1… over old ids.
    const after = collectIds(restoredSession);
    expect(new Set(after).size).toBe(after.length);
  });

  it("does not age players drafted this offseason until next season", () => {
    fresh();
    const session = createSession(63);
    session.phase = "draft";
    beginDraft(session);
    finishDraft(session);

    const draftedIds = new Set(session.draft?.picks.map((pick) => pick.playerId) ?? []);
    const agesBefore = new Map<string, number>();
    for (const team of session.league.teams) {
      for (const player of team.roster) agesBefore.set(player.id, player.age);
    }

    startNextSeason(session);

    for (const team of session.league.teams) {
      for (const player of team.roster) {
        if (draftedIds.has(player.id)) {
          expect(player.age).toBe(agesBefore.get(player.id));
        }
      }
    }
  });
});

describe("full franchise loop", () => {
  function playSeason(session: GameSession) {
    startSeason(session);
    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) playWeek(session);
    return playPlayoffs(session);
  }

  it("plays a season, a postseason, a draft, and rolls into the next year", () => {
    fresh();
    const session = createSession(51);
    const team = yourTeam(session);

    playSeason(session);
    const played = team.record.wins + team.record.losses + team.record.ties;
    expect(played).toBe(REGULAR_SEASON_WEEKS);
    expect(session.playoffs?.championId).toBeTruthy();
    expect(session.seasonReview).toBeDefined();

    if (session.phase === "runOver") return; // fired on year one is a valid outcome

    const draft = beginDraft(session);
    finishDraft(session);
    expect(draft.picks.length).toBeGreaterThan(0);

    startNextSeason(session);
    expect(session.phase).toBe("regularSeason");
    expect(session.week).toBe(1);
    expect(yourTeam(session).record.wins).toBe(0);
    expect(yourTeam(session).roster.length).toBeLessThanOrEqual(ROSTER_LIMIT);
  });

  it("refuses to play a week outside the regular season", () => {
    fresh();
    const session = createSession(53);
    startSeason(session);
    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) playWeek(session);
    expect(session.phase).toBe("playoffs");
    expect(() => playWeek(session)).toThrow();
  });

  it("survives a save and load mid-run", () => {
    fresh();
    const session = createSession(57);
    startSeason(session);
    for (let week = 1; week <= 5; week++) playWeek(session);

    const restored = deserializeSession(serializeSession(session));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.session.week).toBe(session.week);
    expect(restored.session.franchise.teamId).toBe(session.franchise.teamId);
    expect(yourTeam(restored.session).record).toEqual(yourTeam(session).record);

    // And it keeps playing from where it left off.
    playWeek(restored.session);
    expect(restored.session.week).toBe(session.week + 1);
  });

  it("rejects a corrupt or foreign save rather than loading nonsense", () => {
    expect(deserializeSession("not json").ok).toBe(false);
    expect(deserializeSession("{}").ok).toBe(false);
    expect(deserializeSession(JSON.stringify({ version: 99, session: {} })).ok).toBe(false);
  });
});
