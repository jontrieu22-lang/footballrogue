import { describe, expect, it } from "vitest";
import { generateTeam, resetTeamIdCounter } from "../src/generators/teamGenerator.js";
import { generatePlayer, resetPlayerIdCounter } from "../src/generators/playerGenerator.js";
import { SeededRng } from "../src/rng.js";
import { simulateDrive, type DriveContext } from "../src/sim/drive.js";
import { resolvePlay } from "../src/sim/play.js";
import { AiPlayCaller, type GameSituation } from "../src/sim/playCalling.js";
import {
  attemptFieldGoal,
  fieldGoalProbability,
  fieldGoalRangeFromScrimmage,
  getKicker,
  getPunter,
  puntDistance,
} from "../src/sim/kicking.js";
import {
  computeTeamUnits,
  computeUnitRating,
  PASS_OFFENSE,
  RUSH_DEFENSE,
  type TeamUnitRatings,
} from "../src/sim/units.js";

const AVERAGE: TeamUnitRatings = {
  passOffense: 70,
  rushOffense: 70,
  passDefense: 70,
  rushDefense: 70,
};

function makeContext(overrides: Partial<DriveContext> = {}): DriveContext {
  resetPlayerIdCounter();
  resetTeamIdCounter();
  const team = generateTeam(new SeededRng(11));
  return {
    offense: AVERAGE,
    defense: AVERAGE,
    scheme: "westCoast",
    playCaller: new AiPlayCaller(),
    kicker: getKicker(team.roster),
    punter: getPunter(team.roster),
    startingYardsToGoal: 75,
    scoreDifferential: 0,
    secondsRemaining: 1800,
    ...overrides,
  };
}

describe("unit ratings", () => {
  it("reads the attributes that actually do the job", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(3);
    const team = generateTeam(rng);
    const before = computeUnitRating(team.roster, PASS_OFFENSE);

    // Upgrading only the quarterback must lift the passing game.
    team.roster = team.roster.map((p) =>
      p.position === "QB" ? generatePlayer("QB", rng, p.name, { qualityBias: 30 }) : p,
    );
    expect(computeUnitRating(team.roster, PASS_OFFENSE)).toBeGreaterThan(before);
  });

  it("does not let a quarterback upgrade change the run defense", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const rng = new SeededRng(4);
    const team = generateTeam(rng);
    const before = computeUnitRating(team.roster, RUSH_DEFENSE);

    team.roster = team.roster.map((p) =>
      p.position === "QB" ? generatePlayer("QB", rng, p.name, { qualityBias: 30 }) : p,
    );
    expect(computeUnitRating(team.roster, RUSH_DEFENSE)).toBe(before);
  });

  it("rates all four units on a sane scale", () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const units = computeTeamUnits(generateTeam(new SeededRng(5)));
    for (const [name, value] of Object.entries(units)) {
      expect(value, name).toBeGreaterThan(30);
      expect(value, name).toBeLessThan(99);
    }
  });
});

describe("play resolution", () => {
  it("gains more against a weak defense than a strong one", () => {
    const rng = new SeededRng(21);
    const samples = 3000;
    const totalAgainst = (defenseRating: number) => {
      let total = 0;
      for (let i = 0; i < samples; i++) {
        total += resolvePlay("pass", AVERAGE, { ...AVERAGE, passDefense: defenseRating }, rng).yards;
      }
      return total / samples;
    };
    expect(totalAgainst(50)).toBeGreaterThan(totalAgainst(90));
  });

  it("stops the clock on an incompletion and runs it on a carry", () => {
    const rng = new SeededRng(22);
    let sawIncompletion = false;
    for (let i = 0; i < 300; i++) {
      const play = resolvePlay("pass", AVERAGE, AVERAGE, rng);
      if (play.incomplete) {
        sawIncompletion = true;
        expect(play.yards).toBe(0);
        expect(play.clockSeconds).toBeLessThan(15);
      }
    }
    expect(sawIncompletion).toBe(true);
    expect(resolvePlay("run", AVERAGE, AVERAGE, rng).clockSeconds).toBeGreaterThan(30);
  });
});

describe("kicking", () => {
  it("makes short field goals far more often than long ones", () => {
    const kicker = { power: 75, accuracy: 75 };
    expect(fieldGoalProbability(kicker, 5)).toBeGreaterThan(fieldGoalProbability(kicker, 30));
    expect(fieldGoalProbability(kicker, 30)).toBeGreaterThan(fieldGoalProbability(kicker, 45));
  });

  it("gives a stronger leg more range and an accurate leg a better make rate", () => {
    const weak = { power: 55, accuracy: 70 };
    const strong = { power: 90, accuracy: 70 };
    expect(fieldGoalRangeFromScrimmage(strong)).toBeGreaterThan(fieldGoalRangeFromScrimmage(weak));

    const wild = { power: 75, accuracy: 45 };
    const precise = { power: 75, accuracy: 95 };
    expect(fieldGoalProbability(precise, 25)).toBeGreaterThan(fieldGoalProbability(wild, 25));
  });

  it("refuses kicks beyond the kicker's range", () => {
    const kicker = { power: 50, accuracy: 80 };
    expect(fieldGoalProbability(kicker, 60)).toBeLessThan(0.05);
  });

  it("converts a good kicker more often than a poor one over many attempts", () => {
    const rng = new SeededRng(6);
    const makes = (kicker: { power: number; accuracy: number }) => {
      let made = 0;
      for (let i = 0; i < 2000; i++) if (attemptFieldGoal(kicker, 28, rng)) made++;
      return made;
    };
    expect(makes({ power: 85, accuracy: 90 })).toBeGreaterThan(makes({ power: 60, accuracy: 50 }));
  });

  it("punts further with a stronger leg", () => {
    const rng = new SeededRng(7);
    const average = (punter: { power: number; accuracy: number }) => {
      let total = 0;
      for (let i = 0; i < 2000; i++) total += puntDistance(punter, rng);
      return total / 2000;
    };
    expect(average({ power: 92, accuracy: 70 })).toBeGreaterThan(average({ power: 52, accuracy: 70 }));
  });
});

describe("play calling", () => {
  const caller = new AiPlayCaller();
  const situation = (overrides: Partial<GameSituation> = {}): GameSituation => ({
    down: 1,
    yardsToFirstDown: 10,
    yardsToGoal: 60,
    scoreDifferential: 0,
    secondsRemaining: 1800,
    scheme: "westCoast",
    ...overrides,
  });

  const passRate = (situation: GameSituation, seed = 1) => {
    const rng = new SeededRng(seed);
    let passes = 0;
    const samples = 2000;
    for (let i = 0; i < samples; i++) {
      if (caller.callPlay(situation, rng) === "pass") passes++;
    }
    return passes / samples;
  };

  it("passes more in Air Raid than in Power Run", () => {
    expect(passRate(situation({ scheme: "airRaid" }))).toBeGreaterThan(
      passRate(situation({ scheme: "powerRun" })),
    );
  });

  it("throws when trailing late and runs when leading late", () => {
    const trailing = situation({ scoreDifferential: -10, secondsRemaining: 90 });
    const leading = situation({ scoreDifferential: 10, secondsRemaining: 90 });
    expect(passRate(trailing)).toBeGreaterThan(passRate(leading));
  });

  it("runs more on third and short than third and long", () => {
    const short = situation({ down: 3, yardsToFirstDown: 1 });
    const long = situation({ down: 3, yardsToFirstDown: 12 });
    expect(passRate(short)).toBeLessThan(passRate(long));
  });

  it("kicks in range, punts out of range, and goes for it when desperate", () => {
    const rng = new SeededRng(2);
    expect(caller.callFourthDown(situation({ down: 4, yardsToGoal: 20, yardsToFirstDown: 9 }), 35, rng).action).toBe("fieldGoal");
    expect(caller.callFourthDown(situation({ down: 4, yardsToGoal: 80, yardsToFirstDown: 9 }), 35, rng).action).toBe("punt");
    expect(
      caller.callFourthDown(
        situation({ down: 4, yardsToGoal: 70, yardsToFirstDown: 6, scoreDifferential: -14, secondsRemaining: 100 }),
        35,
        rng,
      ).action,
    ).toBe("go");
  });
});

describe("drive engine", () => {
  it("returns the next field position in the other team's frame", () => {
    const rng = new SeededRng(8);
    for (let i = 0; i < 200; i++) {
      const drive = simulateDrive(makeContext(), rng);
      expect(drive.nextFieldPosition).toBeGreaterThanOrEqual(1);
      expect(drive.nextFieldPosition).toBeLessThanOrEqual(99);
    }
  });

  it("scores 6 or 7 for a touchdown and exactly 3 for a field goal", () => {
    const rng = new SeededRng(9);
    let sawTouchdown = false;
    let sawFieldGoal = false;

    for (let i = 0; i < 800; i++) {
      const drive = simulateDrive(makeContext(), rng);
      if (drive.outcome === "touchdown") {
        sawTouchdown = true;
        expect([6, 7]).toContain(drive.points);
      }
      if (drive.outcome === "fieldGoal") {
        sawFieldGoal = true;
        expect(drive.points).toBe(3);
      }
      if (drive.outcome === "punt" || drive.outcome === "turnover") {
        expect(drive.points).toBe(0);
      }
    }

    expect(sawTouchdown).toBe(true);
    expect(sawFieldGoal).toBe(true);
  });

  it("scores more often starting in opposition territory than backed up", () => {
    const rng = new SeededRng(10);
    const pointsFrom = (startingYardsToGoal: number) => {
      let total = 0;
      const drives = 1500;
      for (let i = 0; i < drives; i++) {
        total += simulateDrive(makeContext({ startingYardsToGoal }), rng).points;
      }
      return total / drives;
    };
    expect(pointsFrom(30)).toBeGreaterThan(pointsFrom(90));
  });

  it("never lets the clock consumed exceed what was available", () => {
    const rng = new SeededRng(12);
    for (let i = 0; i < 200; i++) {
      const drive = simulateDrive(makeContext({ secondsRemaining: 120 }), rng);
      // A drive may overrun the final snap, but not by a whole extra series.
      expect(drive.clockSeconds).toBeLessThan(120 + 60);
    }
  });

  it("ends the drive when the clock runs out", () => {
    const rng = new SeededRng(13);

    // No time left at all: the offense never snaps it.
    const expired = simulateDrive(makeContext({ secondsRemaining: 0 }), rng);
    expect(expired.outcome).toBe("endOfHalf");
    expect(expired.playsRun).toBe(0);

    // A single second still buys one snap, then the half ends.
    const lastSnap = simulateDrive(makeContext({ secondsRemaining: 1 }), rng);
    expect(lastSnap.playsRun).toBeLessThanOrEqual(1);
  });
});
