import PlayAnimation, { type Replay } from "./PlayAnimation";
import { useCallback, useState } from "react";
import {
  buildCpuTeam,
  upgradeCpu,
  cpuOffense,
  cpuDefense,
} from "../../src/cpu";
import {
  STATS,
  ROSTER_SIZE,
  HAND_SIZE,
  SLOTS,
  PLAYS,
  DEFENSES,
  deal,
  lockTeam,
  newGame,
  resolvePlay,
  applyResult,
  kick,
  kickChance,
  nextRound,
  replaceCard,
  type Card,
  type Team,
  type Game,
  type Play,
  type Defense,
} from "../../src/game";
type Phase =
  | "animation"
  | "welcome"
  | "handoff"
  | "build"
  | "offense"
  | "defense"
  | "result"
  | "upgrade";
const empty = (): Team => ({
  cards: [],
  lineup: Array<string>(ROSTER_SIZE).fill(""),
});
const descriptions = [
  "RB carries inside. OL run blocking battles the DL.",
  "RB attacks the edge. Bigger gains, bigger risk.",
  "QB carries behind the OL. Test the linebacker’s tackling.",
  "QB finds the WR quickly. OL protects against the DL.",
  "RB catches underneath. Punish a blitzing linebacker.",
  "QB targets WR deep. Beat the CB and safety; OL buys time.",
];
const defenseNotes = [
  "Safety gives modest help against both runs and passes.",
  "Safety joins LB against runs. CB is exposed deep.",
  "LB joins DL to pressure the QB. Exposes screens and runs.",
  "Safety helps CB against deep passes. LB handles runs alone.",
];
export default function App() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [solo, setSolo] = useState(true);
  const [cpuCall, setCpuCall] = useState<Defense>("Balanced");
  const [phase, setPhase] = useState<Phase>("welcome"),
    [destination, setDestination] = useState<Phase>("build");
  const [player, setPlayer] = useState(0),
    [teams, setTeams] = useState<[Team, Team]>([empty(), empty()]);
  const [game, setGame] = useState<Game | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState<Play | null>(null);
  const [offers, setOffers] = useState<[Card[], Card[]]>([[], []]),
    [swapped, setSwapped] = useState(false),
    [resultLines, setResultLines] = useState<string[]>([]),
    [showRules, setShowRules] = useState(false);
  const handoff = (p: number, next: Phase) => {
    setPlayer(p);
    setDestination(next);
    setSelected(null);
    setPhase("handoff");
  };
  const start = (single = solo) => {
    setSolo(single);
    setPending(null);
    setSelected(null);
    setPlayer(0);
    setTeams([
      { cards: deal(HAND_SIZE, "a"), lineup: Array(ROSTER_SIZE).fill("") },
      single
        ? buildCpuTeam(deal(HAND_SIZE, "b"))
        : { cards: deal(HAND_SIZE, "b"), lineup: Array(ROSTER_SIZE).fill("") },
    ]);
    setGame(null);
    if (single) setPhase("build");
    else handoff(0, "build");
  };
  const assign = (slot: number) => {
    if (!selected) return;
    setTeams((old) => {
      const updated = [...old] as [Team, Team];
      const team = {
        ...updated[player]!,
        lineup: [...updated[player]!.lineup],
      };
      const previous = team.lineup.indexOf(selected);
      if (previous >= 0) team.lineup[previous] = team.lineup[slot]!;
      team.lineup[slot] = selected;
      updated[player] = team;
      return updated;
    });
    setSelected(null);
  };
  const lock = () => {
    const updated = [...teams] as [Team, Team];
    updated[player] = lockTeam(updated[player]!);
    setTeams(updated);
    if (player === 0 && !solo) handoff(1, "build");
    else {
      const g = newGame(updated);
      setGame(g);
      prepareTurn(g);
    }
  };
  const prepareTurn = (g: Game) => {
    setSelected(null);
    if (!solo) {
      handoff(g.offense, "offense");
      return;
    }
    setPlayer(0);
    if (g.offense === 0) {
      setCpuCall(cpuDefense(g));
      setPhase("offense");
    } else {
      const call = cpuOffense(g);
      if (call === "kick") animateKick(g);
      else {
        setPending(call);
        setPhase("defense");
      }
    }
  };
  const animateSnap = (before: Game, play: Play, defense: Defense) => {
    const result = resolvePlay(
      before.teams[before.offense]!,
      before.teams[1 - before.offense]!,
      play,
      defense,
    );
    setReplay({
      before,
      after: applyResult(before, result),
      play,
      defense,
      result,
    });
    setPhase("animation");
  };
  const animateKick = (before: Game) => {
    setReplay({ before, after: kick(before), play: "Field Goal" });
    setPhase("animation");
  };
  const finishAnimation = useCallback(() => {
    if (!replay) return;
    setResultLines(
      replay.after.log.slice(
        0,
        Math.max(1, replay.after.log.length - replay.before.log.length),
      ),
    );
    setGame(replay.after);
    setPending(null);
    setReplay(null);
    setPhase("result");
  }, [replay]);
  const continueGame = () => {
    if (!game) return;
    if (game.upgrade) {
      setOffers([deal(3, `a-r${game.round}`), deal(3, `b-r${game.round}`)]);
      setTeams(game.teams);
      setSwapped(false);
      if (solo) {
        setPlayer(0);
        setSelected(null);
        setPhase("upgrade");
      } else handoff(0, "upgrade");
    } else prepareTurn(game);
  };
  const upgradeDone = () => {
    if (player === 0 && !solo) {
      setSwapped(false);
      handoff(1, "upgrade");
    } else {
      const updated: [Team, Team] = solo
        ? [teams[0], upgradeCpu(teams[1], offers[1])]
        : teams;
      setTeams(updated);
      const g = nextRound(game!, updated);
      setGame(g);
      prepareTurn(g);
    }
  };
  const card = (c: Card, offer = false) => (
    <button
      key={c.id}
      className={`card ${selected === c.id ? "selected" : ""} ${teams[player]!.lineup.includes(c.id) ? "assigned" : ""}`}
      onClick={() => setSelected(c.id)}
      disabled={offer && swapped}
      aria-pressed={selected === c.id}
    >
      <span className="card-top">
        ATHLETE{" "}
        <span>
          {teams[player]!.lineup.includes(c.id)
            ? SLOTS[teams[player]!.lineup.indexOf(c.id)]
            : "FREE AGENT"}
        </span>
      </span>
      <strong>{c.name}</strong>
      <div className="stats">
        {STATS.map((s, i) => (
          <div key={s}>
            <span>{s}</span>
            <b className={c.stats[i]! >= 7 ? "high" : ""}>{c.stats[i]}</b>
          </div>
        ))}
      </div>
    </button>
  );
  const lineup = (interactive: boolean) => (
    <div className="lineups">
      {["OFFENSE", "DEFENSE"].map((label, unit) => (
        <section key={label}>
          <h3>{label}</h3>
          <div className="slots">
            {SLOTS.slice(unit * 4, unit * 4 + 4).map((slot, j) => {
              const index = unit * 4 + j,
                c = teams[player]!.cards.find(
                  (c) => c.id === teams[player]!.lineup[index],
                );
              return (
                <button
                  key={slot}
                  className={`slot ${selected ? "ready" : ""}`}
                  disabled={!interactive || !selected}
                  onClick={() => {
                    if (
                      phase === "upgrade" &&
                      offers[player]!.some((c) => c.id === selected)
                    ) {
                      setTeams((old) => {
                        const next = [...old] as [Team, Team];
                        next[player] = replaceCard(
                          next[player]!,
                          index,
                          offers[player]!.find((c) => c.id === selected)!,
                        );
                        return next;
                      });
                      setSelected(null);
                      setSwapped(true);
                    } else assign(index);
                  }}
                >
                  <b>{slot}</b>
                  <span>{c?.name ?? "Assign a card"}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
  return (
    <main>
      <header>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="logo">FR</span> FOOTBALL <b>ROGUE</b>
        </a>
        <button className="quiet" onClick={() => setShowRules(!showRules)}>
          How to play
        </button>
      </header>
      {showRules && (
        <aside className="rules">
          <button className="quiet" onClick={() => setShowRules(false)}>
            Close ×
          </button>
          <h2>A football game of hands and reads.</h2>
          <p>
            Play solo against the CPU, or share this device with a second
            person. Deal 10 universal athletes, assign 4 on offense and 4 on
            defense. The two unassigned cards are discarded. Select a card, then
            a slot; selecting an assigned card lets you swap positions.
          </p>
          <p>
            Each snap: offense locks a secret play, hands the device to defense,
            then calls reveal. Four downs to gain 10 yards. Touchdowns score 7.
            Fourth-down field goals score 3; distance is yards to the goal line
            + 17. A safety scores 2 for defense.
          </p>
          <p>
            Each round gives both players one possession from the opponent’s 45-yard line. First to 21 wins only
            after equal possessions, and only with a lead. Between rounds, each
            gets three cards and can swap in one, or keep their team. Rosters
            are public after locking. After eight rounds, a leader wins; ties
            continue from the opponent’s 20.
          </p>
          <p>
            This is local pass-and-play. Hands are hidden by handoff screens,
            not protected from someone inspecting browser memory. No online room
            or accounts are required.
          </p>
        </aside>
      )}
      {game && phase !== "handoff" && (
        <div className="scoreboard">
          <div className={game.offense === 0 ? "active" : ""}>
            PLAYER 01 <strong>{game.scores[0]}</strong>
          </div>
          <span>
            ROUND {game.round}
            <small>FIRST TO 21 · EQUAL POSSESSIONS</small>
          </span>
          <div className={game.offense === 1 ? "active" : ""}>
            <strong>{game.scores[1]}</strong> {solo ? "CPU" : "PLAYER 02"}
          </div>
        </div>
      )}
      {phase === "welcome" && (
        <section className="hero">
          <p className="eyebrow">YOUR TEAM. TEN CARDS. YOUR CALL.</p>
          <h1>
            Build your hand.
            <br />
            Read their game.
          </h1>
          <p className="intro">
            Turn a handful of athletes into a winning team. Call the play,
            outthink the defense, and rebuild between rounds.
          </p>
          <div className="mode-buttons">
            <button className="primary" onClick={() => start(true)}>
              Play against CPU <span>↗</span>
            </button>
            <button className="quiet" onClick={() => start(false)}>
              Two players · pass & play
            </button>
          </div>
          <div className="features">
            <span>01 / BUILD A TEAM</span>
            <span>02 / CALL YOUR SHOT</span>
            <span>03 / ADAPT & WIN</span>
          </div>
          <div className="hero-field">
            <span>10</span>
            <span>20</span>
            <span>30</span>
            <strong>FR</strong>
            <span>30</span>
            <span>20</span>
            <span>10</span>
          </div>
          <p className="muted">
            Solo vs CPU or local two-player · No account needed
          </p>
        </section>
      )}
      {phase === "handoff" && (
        <section className="handoff">
          <p className="eyebrow">PRIVATE HUDDLE</p>
          <div className="player-number">0{player + 1}</div>
          <h1>Pass to Player {player + 1}.</h1>
          <p>
            {destination === "defense"
              ? "The offensive call is locked. Choose your response in private."
              : destination === "build"
                ? "Your ten cards are waiting. Build your team in private."
                : destination === "upgrade"
                  ? "Three new athletes. One roster spot. Make your move."
                  : "Choose your offensive play before handing over the device."}
          </p>
          <button className="primary" onClick={() => setPhase(destination)}>
            I’m Player {player + 1} — ready
          </button>
        </section>
      )}
      {phase === "build" && (
        <>
          <div className="section-title">
            <div>
              <p className="eyebrow">PLAYER 0{player + 1} / THE DRAFT</p>
              <h1>Ten cards. Eight starters.</h1>
              <p>
                Select an athlete, then a position. Every card can play either
                side.
              </p>
            </div>
            <button
              className="primary"
              disabled={
                teams[player]!.lineup.filter(Boolean).length !== ROSTER_SIZE
              }
              onClick={lock}
            >
              Lock team · {teams[player]!.lineup.filter(Boolean).length}/
              {ROSTER_SIZE}
            </button>
          </div>
          {lineup(true)}
          <div className="card-grid">
            {teams[player]!.cards.map((c) => card(c))}
          </div>
        </>
      )}
      {(phase === "offense" || phase === "defense") && game && (
        <>
          <div className="section-title">
            <div>
              <p className="eyebrow">
                PLAYER 0{player + 1} /{" "}
                {phase === "offense" ? "OFFENSIVE CALL" : "DEFENSIVE CALL"}
              </p>
              <h1>
                {phase === "offense" ? "Find the opening." : "Make your read."}
              </h1>
            </div>
            <div className="down">
              {game.down}
              {["", "st", "nd", "rd", "th"][game.down]} & {game.toGo}
              <small>
                {game.yard === 50
                  ? "MIDFIELD"
                  : game.yard > 50
                    ? `OPPONENT’S ${100 - game.yard}`
                    : `OWN ${game.yard}`}
              </small>
            </div>
          </div>
          {solo && (
            <p className="cpu-status">
              {phase === "offense"
                ? "CPU defense is locked in. Choose your play."
                : "CPU offense is locked in. Choose your defense."}
            </p>
          )}
          <div className="field">
            <div className="ball" style={{ left: `${game.yard}%` }}>
              ◆
            </div>
            <div
              className="first-down"
              style={{ left: `${Math.min(100, game.yard + game.toGo)}%` }}
            />
            <span>OWN END ZONE</span>
            <span>50</span>
            <span>TOUCHDOWN →</span>
          </div>
          <div className="play-grid">
            {phase === "offense"
              ? PLAYS.map((p, i) => (
                  <button
                    className="play"
                    key={p}
                    onClick={() => {
                      if (solo) animateSnap(game, p, cpuCall);
                      else {
                        setPending(p);
                        handoff(1 - game.offense, "defense");
                      }
                    }}
                  >
                    <span>
                      0{i + 1} / {i < 3 ? "RUN" : "PASS"}
                    </span>
                    <h2>{p}</h2>
                    <p>{descriptions[i]}</p>
                    <b>LOCK PLAY ↗</b>
                  </button>
                ))
              : DEFENSES.map((d, i) => (
                  <button
                    className="play"
                    key={d}
                    onClick={() => animateSnap(game, pending!, d)}
                  >
                    <span>0{i + 1} / DEFENSE</span>
                    <h2>{d}</h2>
                    <p>{defenseNotes[i]}</p>
                    <b>LOCK & REVEAL ↗</b>
                  </button>
                ))}
          </div>
          {phase === "offense" && game.down === 4 && (
            <button
              className="kick"
              disabled={!kickChance(117 - game.yard)}
              onClick={() => animateKick(game)}
            >
              Attempt field goal · {117 - game.yard} yards ·{" "}
              {Math.round(kickChance(117 - game.yard) * 100)}% chance · +3
              points
            </button>
          )}
          <details>
            <summary>Scout both rosters</summary>
            <div className="scouting">
              {game.teams.map((t, i) => (
                <section key={i}>
                  <h3>{solo && i === 1 ? "CPU" : `PLAYER ${i + 1}`}</h3>
                  {SLOTS.map((s, j) => {
                    const c = t.cards.find((c) => c.id === t.lineup[j])!;
                    return (
                      <p key={s}>
                        <b>
                          {s} · {c.name}
                        </b>
                        <small>
                          {STATS.map((stat, k) => `${stat} ${c.stats[k]}`).join(
                            " · ",
                          )}
                        </small>
                      </p>
                    );
                  })}
                </section>
              ))}
            </div>
          </details>
        </>
      )}
      {phase === "animation" && replay && (
        <PlayAnimation replay={replay} onComplete={finishAnimation} />
      )}
      {phase === "result" && game && (
        <section className="result">
          <p className="eyebrow">
            {game.winner !== null ? "FINAL WHISTLE" : "THE REVEAL"}
          </p>
          <h1>
            {game.winner !== null
              ? solo
                ? game.winner === 0
                  ? "You win."
                  : "CPU wins."
                : `Player ${game.winner + 1} wins.`
              : game.upgrade
                ? "Round complete."
                : "Play resolved."}
          </h1>
          {resultLines.map((line, i) => (
            <p className="result-line" key={i}>
              {line}
            </p>
          ))}
          {game.winner !== null ? (
            <button className="primary" onClick={() => start()}>
              Deal a rematch ↗
            </button>
          ) : (
            <button className="primary" onClick={continueGame}>
              {game.upgrade ? "Draft your upgrades" : "Next snap / possession"}{" "}
              ↗
            </button>
          )}
          <details>
            <summary>Match history</summary>
            {game.log.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </details>
        </section>
      )}
      {phase === "upgrade" && (
        <>
          <div className="section-title">
            <div>
              <p className="eyebrow">PLAYER 0{player + 1} / BETWEEN ROUNDS</p>
              <h1>
                {swapped
                  ? "New blood. New possibilities."
                  : "One card can change the game."}
              </h1>
              <p>
                {swapped
                  ? "Upgrade applied. Rearrange your starters or lock your team."
                  : "Choose an offer, then the slot to replace. Or keep your current team."}
              </p>
            </div>
            <button className="primary" onClick={upgradeDone}>
              {swapped ? "Lock updated team" : "Keep team / finish"}
            </button>
          </div>
          <div className="offer-grid">
            {offers[player]!.map((c) => card(c, true))}
          </div>
          {lineup(true)}
          <h3>YOUR STARTERS · SELECT TO REARRANGE</h3>
          <div className="card-grid">
            {teams[player]!.cards.map((c) => card(c))}
          </div>
        </>
      )}
      <footer>
        FOOTBALL ROGUE <span>THE HAND YOU’RE DEALT. THE CALLS YOU MAKE.</span>
      </footer>
    </main>
  );
}
