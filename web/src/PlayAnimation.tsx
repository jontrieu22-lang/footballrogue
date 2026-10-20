import { useEffect, useState, type CSSProperties } from "react";
import {
  SLOTS,
  clamp,
  type Game,
  type Play,
  type Defense,
  type Result,
} from "../../src/game";
export interface Replay {
  before: Game;
  after: Game;
  play: Play | "Field Goal";
  defense?: Defense;
  result?: Result;
}
type Point = [number, number];
const offenseStart: Point[] = [
  [25, 52],
  [20, 73],
  [35, 20],
  [39, 52],
];
const defenseStart: Point[] = [
  [47, 52],
  [55, 72],
  [48, 20],
  [72, 40],
];
export default function PlayAnimation({
  replay,
  onComplete,
  completed = false,
}: {
  replay: Replay;
  onComplete: () => void;
  completed?: boolean;
}) {
  const [stage, setStage] = useState(0);
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (completed) {
      setStage(3);
      return;
    }
    const timers = [
      setTimeout(() => setStage(1), 450),
      setTimeout(() => setStage(2), 1400),
      setTimeout(() => setStage(3), 2600),
    ];
    if (reduced) {
      timers.forEach(clearTimeout);
      setStage(3);
    }
    const done = setTimeout(onComplete, reduced ? 1600 : 4200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [onComplete, reduced, completed]);
  const { before, after, play, defense, result } = replay;
  const isKick = play === "Field Goal",
    run = ["Inside Run", "Outside Run", "QB Keep"].includes(play),
    screen = play === "Screen";
  const sack = result?.kind === "sack",
    incomplete = result?.kind === "incomplete",
    intercept = result?.turnover;
  const touchdown =
    !isKick && !intercept && before.yard + (result?.yards ?? 0) >= 100;
  const carrier = run ? (play === "QB Keep" ? 0 : 1) : screen ? 1 : 2;
  const x = clamp(40 + (result?.yards ?? 0) * 1.65, 22, 85),
    y = play === "Outside Run" ? 82 : screen ? 72 : run ? 52 : 22;
  const target: Point = [x, y];
  const attack: Point[] = offenseStart.map((p) => [...p]);
  const defenders: Point[] = defenseStart.map((p) => [...p]);
  if (stage > 0) {
    attack[3] = [43, 52];
    defenders[0] = [46, 52];
    attack[2] = [stage === 1 ? 53 : run ? 65 : x, 20];
    attack[1] =
      run || screen
        ? [stage === 1 ? 34 : x, play === "Outside Run" ? 82 : screen ? 72 : 52]
        : [34, 66];
    attack[0] = play === "QB Keep" ? [stage === 1 ? 34 : x, 52] : [23, 52];
    defenders[1] =
      defense === "Blitz"
        ? [stage === 1 ? 39 : 25, 56]
        : [stage === 1 ? 52 : x + 3, run ? y + 4 : screen ? y + 5 : 65];
    defenders[2] = [stage === 1 ? 55 : x + 3, 25];
    defenders[3] =
      defense === "Run Stop"
        ? [stage === 1 ? 56 : x + 8, 55]
        : [stage === 1 ? 68 : x + 8, run ? y - 9 : 28];
    if (sack) {
      defenders[0] = [stage === 1 ? 39 : 25, 49];
      attack[carrier] = offenseStart[carrier]!;
    }
    if (intercept) {
      defenders[2] = [x, 22];
      if (stage === 3) defenders[2] = [x - 8, 35];
    }
    if (touchdown && stage >= 2) attack[carrier] = [90, y];
  }
  let ball: Point =
    stage === 0
      ? [27, 52]
      : run
        ? attack[carrier]!
        : stage === 1
          ? [25, 52]
          : target;
  if (sack) ball = [25, 52];
  if (intercept && stage >= 2) ball = defenders[2]!;
  if (touchdown && stage >= 2) ball = attack[carrier]!;
  const made = after.scores[before.offense]! > before.scores[before.offense]!;
  if (isKick) ball = stage < 2 ? [30, 52] : [90, made ? 50 : 20];
  const label = isKick
    ? made
      ? "FIELD GOAL GOOD"
      : "FIELD GOAL MISSED"
    : touchdown
      ? "TOUCHDOWN"
      : intercept
        ? "INTERCEPTED"
        : sack
          ? "SACK"
          : incomplete
            ? "INCOMPLETE"
            : `${(result?.yards ?? 0) >= 0 ? "+" : ""}${result?.yards ?? 0} YARDS`;
  const style = (point: Point): CSSProperties => ({
    left: `${point[0]}%`,
    top: `${point[1]}%`,
  });
  return (
    <section
      className={`replay ${reduced ? "reduced-motion" : ""}`}
      aria-label="Animated play replay"
    >
      <div className="replay-heading">
        <div>
          <p className="eyebrow">
            ON THE FIELD · {before.offense === 0 ? "PLAYER 1" : "OPPONENT"}{" "}
            POSSESSION
          </p>
          <h1>{play}</h1>
          <p>
            {isKick
              ? `${117 - before.yard}-yard attempt`
              : `vs. ${defense} · ${before.down} & ${before.toGo}`}
          </p>
        </div>
        {!completed && (
          <button className="quiet" onClick={onComplete}>
            Skip animation →
          </button>
        )}
      </div>
      <div className="replay-field" aria-hidden="true">
        <div className="replay-endzone">END ZONE</div>
        <div className="scrimmage-line" />
        <div
          className="replay-gain-line"
          style={{ left: `${clamp(40 + before.toGo * 1.65, 40, 86)}%` }}
        />
        {[10, 20, 30, 40, 50].map((n, i) => (
          <span
            className="field-number"
            key={n}
            style={{ left: `${13 + i * 16}%` }}
          >
            {n}
          </span>
        ))}
        <svg
          className="route-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d={`M ${offenseStart[carrier]![0]} ${offenseStart[carrier]![1]} Q 42 ${y} ${touchdown ? 90 : x} ${y}`}
          />
        </svg>
        {before.teams.map((team, side) =>
          Array.from({ length: 4 }, (_, i) => {
            const attacking = side === before.offense,
              slot = attacking ? i : i + 4,
              card = team.cards.find((c) => c.id === team.lineup[slot])!;
            const pos = attacking ? attack[i]! : defenders[i]!;
            return (
              <div
                key={`${side}-${card.id}`}
                className={`field-card ${attacking ? "attacker" : "defender"} ${attacking && i === carrier ? "carrier" : ""} ${stage === 3 && !incomplete && !isKick && ((attacking && i === carrier) || (!attacking && i === 1)) ? "contact" : ""}`}
                style={style(pos)}
              >
                <b>{SLOTS[slot]}</b>
                <strong>{card.name.split(" ").at(-1)}</strong>
                <span>{attacking ? "OFFENSE" : "DEFENSE"}</span>
              </div>
            );
          }),
        )}
        <div
          className={`replay-ball ${stage === 2 && !run && !sack ? "airborne" : ""} ${stage === 3 && incomplete ? "dropped" : ""}`}
          style={style(ball)}
        >
          🏈
        </div>
        {isKick && <div className="goalposts" />}
        {stage === 3 && (
          <div className={`replay-outcome ${touchdown ? "touchdown" : ""}`}>
            {label}
          </div>
        )}
      </div>
      <div className="replay-caption" role="status" aria-live="polite">
        {stage === 0
          ? "Teams set at the line…"
          : stage === 1
            ? "Snap!"
            : stage === 2
              ? isKick
                ? "The kick is away…"
                : sack
                  ? "Pressure gets home…"
                  : run
                    ? "Following the blocks…"
                    : "The ball is in the air…"
              : label}
      </div>
      <p className="muted">
        Play illustration · movement follows the resolved outcome; field spacing
        is schematic.
      </p>
    </section>
  );
}
