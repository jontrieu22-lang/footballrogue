import { useReducer, useState } from "react";
import {
  createSession,
  playPlayoffs,
  yourTeam,
  type GameSession,
} from "../../src/franchise/game.js";
import {
  clearBrowserSave,
  hasBrowserSave,
  loadFromBrowser,
  saveToBrowser,
} from "../../src/franchise/save.js";
import { resetPlayerIdCounter } from "../../src/generators/playerGenerator.js";
import { resetTeamIdCounter } from "../../src/generators/teamGenerator.js";
import { SCHEME_LABELS } from "../../src/schemes.js";
import { computeTeamUnits } from "../../src/sim/units.js";
import { DraftScreen } from "./DraftScreen.js";
import { ReviewScreen, RunOverScreen } from "./EndScreens.js";
import { RosterScreen } from "./RosterScreen.js";
import { SeasonScreen } from "./SeasonScreen.js";

type Stage = "start" | "pickTeam" | "play";
type Tab = "season" | "roster" | "draft";

export default function App() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [session, setSession] = useState<GameSession | null>(null);
  const [stage, setStage] = useState<Stage>("start");
  const [tab, setTab] = useState<Tab>("season");
  const [reviewPending, setReviewPending] = useState(false);
  const [seedInput, setSeedInput] = useState("");

  /** Every mutation goes through here: run it, autosave, re-render. */
  const act = (mutate: () => void) => {
    mutate();
    if (session) saveToBrowser(session);
    bump();
  };

  const newRun = () => {
    resetPlayerIdCounter();
    resetTeamIdCounter();
    const seed = Number(seedInput) || Math.floor(Math.random() * 2 ** 31);
    setSession(createSession(seed));
    setStage("pickTeam");
  };

  const continueRun = () => {
    const loaded = loadFromBrowser();
    if (loaded.ok) {
      setSession(loaded.session);
      setStage("play");
      setTab("season");
    }
  };

  const abandonRun = () => {
    clearBrowserSave();
    setSession(null);
    setReviewPending(false);
    setStage("start");
    setTab("season");
  };

  if (stage === "start" || !session) {
    return (
      <div className="app center-screen">
        <h1 className="title">FOOTBALL ROGUE</h1>
        <p className="subtitle">One franchise. Ownership is not patient.</p>
        <div className="start-actions">
          <input
            className="seed-input"
            placeholder="seed (optional)"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
          />
          <button className="btn primary" onClick={newRun}>
            New Run
          </button>
          {hasBrowserSave() && (
            <button className="btn" onClick={continueRun}>
              Continue Run
            </button>
          )}
        </div>
      </div>
    );
  }

  if (stage === "pickTeam") {
    const rated = session.league.teams
      .map((team) => {
        const units = computeTeamUnits(team);
        const rating =
          (units.passOffense + units.rushOffense + units.passDefense + units.rushDefense) / 4;
        return { team, rating };
      })
      .sort((a, b) => b.rating - a.rating);

    return (
      <div className="app">
        <h2>Choose your franchise</h2>
        <p className="muted">
          Seed {session.seed}. Taking a bottom team is hard mode — ownership expects wins either
          way.
        </p>
        <div className="team-grid">
          {rated.map(({ team, rating }, index) => (
            <button
              key={team.id}
              className="team-pick"
              onClick={() => {
                session.franchise.teamId = team.id;
                saveToBrowser(session);
                setStage("play");
                setTab("season");
              }}
            >
              <span className="team-rank">#{index + 1}</span>
              <span className="team-name">{team.name}</span>
              <span className="team-rating">{rating.toFixed(1)}</span>
              <span className="team-schemes">
                {SCHEME_LABELS[team.scheme.offense]} · {SCHEME_LABELS[team.scheme.defense]}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (reviewPending) {
    return (
      <ReviewScreen
        session={session}
        onContinue={() => {
          setReviewPending(false);
          if (session.phase === "draft") setTab("draft");
        }}
      />
    );
  }

  if (session.phase === "runOver") {
    return <RunOverScreen session={session} onNewRun={abandonRun} />;
  }

  const effectiveTab: Tab = tab === "draft" && session.phase !== "draft" ? "season" : tab;
  const team = yourTeam(session);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">FOOTBALL ROGUE</span>
        <span className="you">
          {team.name} · Season {session.franchise.season}
        </span>
        <nav>
          <button
            className={effectiveTab === "season" ? "tab active" : "tab"}
            onClick={() => setTab("season")}
          >
            Season
          </button>
          <button
            className={effectiveTab === "roster" ? "tab active" : "tab"}
            onClick={() => setTab("roster")}
          >
            Roster
          </button>
          {session.phase === "draft" && (
            <button
              className={effectiveTab === "draft" ? "tab active" : "tab"}
              onClick={() => setTab("draft")}
            >
              Draft
            </button>
          )}
        </nav>
        <button className="btn small danger" onClick={abandonRun}>
          Abandon
        </button>
      </header>

      {effectiveTab === "season" && (
        <SeasonScreen
          session={session}
          act={act}
          onPlayoffs={() => {
            act(() => playPlayoffs(session));
            setReviewPending(true);
          }}
        />
      )}
      {effectiveTab === "roster" && <RosterScreen session={session} act={act} />}
      {effectiveTab === "draft" && <DraftScreen session={session} act={act} />}
    </div>
  );
}
