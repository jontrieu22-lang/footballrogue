import { finishScoutedPlay, scoutRead, describeRead } from "../../src/scouting";
import { matchups, tendencies, upgradeOptions } from "../../src/insights";
import PlayAnimation, { type Replay } from "./PlayAnimation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROLE_WEIGHTS,
  type OffenseFocus,
  type DefenseFocus,
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
const positionJobs = [
  "Throws passes and carries on QB Keep.",
  "Carries inside/outside runs and catches screens.",
  "Catches quick and deep passes.",
  "Run blocking faces DL run defense; pass blocking faces DL pass rush.",
  "Opposes the OL: stops running lanes and pressures the QB.",
  "Tackles runners and receivers; adds pass rush when blitzing.",
  "Covers the intended receiver.",
  "Helps coverage or tackling according to your defensive call.",
];
function PositionGuide() {
  return (
    <details className="position-guide">
      <summary>Position value · stats & weights</summary>
      <p>
        Role fit is a weighted average on a 1–10 scale, used for CPU roster
        building and upgrade recommendations. A higher fit means a better
        general match for that position—not a guaranteed better play.
      </p>
      <div className="comparison-grid">
        {SLOTS.map((slot, i) => (
          <div key={slot}>
            <b>{slot}</b>
            <p>{positionJobs[i]}</p>
            {ROLE_WEIGHTS[i]!.map((weight, stat) =>
              weight > 0 ? (
                <span key={stat}>
                  {STATS[stat]} <strong>{Math.round(weight * 100)}%</strong>
                </span>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <p>
        <strong>On the field:</strong> Runs weigh the OL-vs-DL blocking edge 60%
        and the runner-vs-tackling edge 40%. Pass quality is 55% QB passing +
        45% target catching, after a separate protection check. OL uses 100% run
        blocking on runs or 100% pass blocking on passes—its 50/50 role fit is
        only a roster comparison.
      </p>
      <p>
        <strong>Defense changes the matchup:</strong> Safety contributes 20% of
        coverage/tackling in Balanced; Run Stop raises tackling help to 45% and
        removes coverage help; Pass Coverage raises coverage help to 45% and
        removes tackling help. Blitz pressure uses 65% DL + 35% LB pass rush,
        with a pressure bonus and weaker coverage/tackling.
      </p>
    </details>
  );
}
export default function App() {
  const [offenseFocus, setOffenseFocus] = useState<OffenseFocus>("balanced");
  const [defenseFocus, setDefenseFocus] = useState<DefenseFocus>("balanced");
  const [autoNote, setAutoNote] = useState("");
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
  const playbookRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const showPlaybook = () => {
    playbookRef.current?.focus({ preventScroll: true });
    playbookRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  useEffect(() => {
    if (phase === "offense" || phase === "defense") showPlaybook();
    else if (phase === "animation")
      fieldRef.current?.scrollIntoView({ block: "start" });
  }, [phase]);
  const handoff = (p: number, next: Phase) => {
    if (next === "build") {
      setOffenseFocus("balanced");
      setDefenseFocus("balanced");
      setAutoNote("");
    }
    setPlayer(p);
    setDestination(next);
    setSelected(null);
    setPhase("handoff");
  };
  const start = (single = solo) => {
    setSolo(single);
    setReplay(null);
    setResultLines([]);
    setOffenseFocus("balanced");
    setDefenseFocus("balanced");
    setAutoNote("");
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
      after: finishScoutedPlay(before, result, play, defense),
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
    if (solo && replay.after.winner === null && !replay.after.upgrade) {
      prepareTurn(replay.after);
    } else setPhase("result");
  }, [replay, solo]);
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
      {offer &&
        !swapped &&
        (() => {
          const best = upgradeOptions(teams[player]!, c)[0]!;
          return (
            <div className="upgrade-hint">
              <b>
                {best.fit > 0
                  ? `Best fit: ${best.slot}`
                  : "No clear role upgrade"}
              </b>
              <span>
                {best.slot} vs {best.current}:{" "}
                {best.changes
                  .map(
                    (change) =>
                      `${STATS[change.stat]} ${change.delta > 0 ? "+" : ""}${change.delta}`,
                  )
                  .join(" · ")}
              </span>
            </div>
          );
        })()}
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
            Each round gives both players one possession from the opponent’s
            45-yard line. First to 21 wins only after equal possessions, and
            only with a lead. Between rounds, each gets three cards and can swap
            in one, or keep their team. Rosters are public after locking. After
            eight rounds, a leader wins; ties continue from the opponent’s 20.
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
            Draft your squad.
            <br />
            Rule the turf.
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
          <section className="auto-draft">
            <h3>AUTO-SELECT YOUR TEAM</h3>
            <p>
              Choose a style for each side, then fill all eight positions. Your
              full ten-card hand stays available until you lock the team.
            </p>
            <div className="draft-controls">
              <label>
                Offense
                <select
                  value={offenseFocus}
                  onChange={(e) => {
                    setOffenseFocus(e.target.value as OffenseFocus);
                    setAutoNote("");
                  }}
                >
                  <option value="balanced">Balanced offense</option>
                  <option value="passing">Passing offense</option>
                  <option value="rushing">Rushing offense</option>
                </select>
              </label>
              <label>
                Defense
                <select
                  value={defenseFocus}
                  onChange={(e) => {
                    setDefenseFocus(e.target.value as DefenseFocus);
                    setAutoNote("");
                  }}
                >
                  <option value="balanced">Balanced defense</option>
                  <option value="pass">Pass defense</option>
                  <option value="rush">Rush defense</option>
                </select>
              </label>
              <button
                className="primary"
                onClick={() => {
                  setTeams((old) => {
                    const next = [...old] as [Team, Team];
                    const team = old[player]!;
                    next[player] = {
                      ...team,
                      lineup: buildCpuTeam(team.cards, {
                        offense: offenseFocus,
                        defense: defenseFocus,
                      }).lineup,
                    };
                    return next;
                  });
                  setSelected(null);
                  setAutoNote(
                    "Eight starters selected. Review the lineup, rearrange any cards, or try another style before locking.",
                  );
                }}
              >
                Auto-select team
              </button>
            </div>
            <p className="muted">
              {offenseFocus === "passing"
                ? "Prioritizes QB passing, receiving, and OL pass protection."
                : offenseFocus === "rushing"
                  ? "Prioritizes RB/QB rushing and OL run blocking."
                  : "Balances your passing and running options."}{" "}
              {defenseFocus === "pass"
                ? "Prioritizes coverage and pass rush."
                : defenseFocus === "rush"
                  ? "Prioritizes DL run defense and LB/safety tackling."
                  : "Balances coverage, tackling, and pressure."}{" "}
              These preferences guide the lineup only; they do not change card
              stats or restrict play calls.
            </p>
            {autoNote && <p role="status">{autoNote}</p>}
          </section>
          <PositionGuide />
          {lineup(true)}
          <div className="card-grid">
            {teams[player]!.cards.map((c) => card(c))}
          </div>
        </>
      )}
      {["offense", "defense", "animation", "result"].includes(phase) &&
        game && (
          <div className="live-field" ref={fieldRef}>
            {replay && (
              <PlayAnimation
                key={replay.before.log.length}
                replay={replay}
                onComplete={finishAnimation}
                completed={phase !== "animation"}
              />
            )}
            {phase !== "animation" && resultLines.length > 0 && game && (
              <section className="inline-result">
                <p className="eyebrow">
                  {game.winner !== null ? "FINAL WHISTLE" : "LAST PLAY"}
                </p>
                <h2>
                  {game.winner !== null
                    ? solo
                      ? game.winner === 0
                        ? "You win."
                        : "CPU wins."
                      : `Player ${game.winner + 1} wins.`
                    : game.upgrade
                      ? "Round complete."
                      : "Next snap!"}
                </h2>
                {resultLines.map((line, i) => (
                  <p className="result-line" key={i} role="status">
                    {line}
                  </p>
                ))}
                {game.winner !== null ? (
                  <button className="primary" onClick={() => start()}>
                    Deal a rematch ↗
                  </button>
                ) : phase === "result" ? (
                  <button className="primary" onClick={continueGame}>
                    {game.upgrade
                      ? "Draft your upgrades"
                      : "Next snap / possession"}{" "}
                    ↗
                  </button>
                ) : (
                  <button className="primary" onClick={showPlaybook}>
                    {phase === "offense"
                      ? "Choose next play ↓"
                      : "Choose your defense ↓"}
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
          </div>
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
                {phase === "offense" ? "Pick your play." : "Call your defense."}
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
          <aside className="scout-report">
            <h3>OPPONENT TENDENCIES</h3>
            {(() => {
              const report = tendencies(
                game.calls,
                1 - player,
                phase === "offense" ? "defense" : "offense",
              );
              return report.total ? (
                <>
                  <p>
                    Last {report.total} revealed{" "}
                    {phase === "offense" ? "defensive" : "offensive"} calls
                  </p>
                  <div className="tendency-chips">
                    {report.counts.map((c) => (
                      <span key={c.name}>
                        {c.name}{" "}
                        <b>
                          {c.count}/{report.total}
                        </b>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p>
                  No revealed calls yet. Watch for patterns as the game
                  develops.
                </p>
              );
            })()}
            <small>History only. The current call is hidden.</small>
          </aside>
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
          {phase === "offense" && (
            <p className="muted">
              Matchup reads use only scouted opponent stats before formation
              bonuses, safety help, or execution rolls. They are not success
              probabilities.
            </p>
          )}
          <div className="playbook-heading" ref={playbookRef} tabIndex={-1}>
            <p className="eyebrow">
              YOUR TURN · {game.down} & {game.toGo} ·{" "}
              {game.yard >= 50
                ? `OPPONENT’S ${100 - game.yard}`
                : `OWN ${game.yard}`}
            </p>
            <h2>
              {phase === "offense"
                ? "Choose your next play ↓"
                : "Choose your defense ↓"}
            </h2>
            {resultLines.length > 0 && (
              <p className="last-snap-recap">{resultLines[0]}</p>
            )}
            <p>Tap a card to lock your call.</p>
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
                    <div className="matchup-read">
                      {matchups(
                        game.teams[game.offense]!,
                        game.teams[1 - game.offense]!,
                        p,
                        game,
                        player,
                      ).map((m) => (
                        <span key={m.label}>
                          {m.label}
                          <b
                            className={
                              m.assessment === "Advantage"
                                ? "positive"
                                : m.assessment === "Disadvantage"
                                  ? "negative"
                                  : ""
                            }
                          >
                            {m.assessment} · {m.detail}
                          </b>
                        </span>
                      ))}
                    </div>
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
            <summary>Your roster & opponent scouting</summary>
            <p className="muted">
              Opponent stats reveal through involvement: unknown → minimum →
              range → exact after three observations. New cards start unknown;
              retained cards keep their scouting.
            </p>
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
                          {STATS.map(
                            (stat, k) =>
                              `${stat} ${i === player ? c.stats[k] : describeRead(scoutRead(game, player, c.id, k))}`,
                          ).join(" · ")}
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
          {selected &&
            offers[player]!.some((c) => c.id === selected) &&
            !swapped && (
              <section className="upgrade-comparison">
                <h3>WHERE DOES THIS CARD HELP?</h3>
                <p>
                  Compare role-relevant stats. Select a position below to
                  replace its current starter.
                </p>
                <div className="comparison-grid">
                  {upgradeOptions(
                    teams[player]!,
                    offers[player]!.find((c) => c.id === selected)!,
                  ).map((o) => (
                    <div key={o.slot}>
                      <b>
                        {o.slot} · {o.current}
                      </b>
                      {o.changes.map((c) => (
                        <span key={c.stat}>
                          {STATS[c.stat]}{" "}
                          <strong
                            className={
                              c.delta > 0
                                ? "positive"
                                : c.delta < 0
                                  ? "negative"
                                  : ""
                            }
                          >
                            {c.delta > 0 ? "+" : ""}
                            {c.delta}
                          </strong>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}
          <PositionGuide />
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
