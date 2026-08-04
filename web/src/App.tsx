import { useReducer, useState } from "react";
import {
  createSession,
  pickTeam,
  playPlayoffs,
  runLegacy,
  yourTeam,
  type GameSession,
} from "../../src/franchise/game.js";
import {
  clearBrowserSave,
  hasBrowserSave,
  loadCoachProfileFromBrowser,
  loadFromBrowser,
  saveCoachProfileToBrowser,
  saveToBrowser,
} from "../../src/franchise/save.js";
import {
  createCoachProfile,
  mergeRunIntoProfile,
  tierForExperience,
  type CoachProfile,
} from "../../src/franchise/coachProfile.js";
import {
  resetPlayerIdCounter,
  setPlayerIdCounter,
} from "../../src/generators/playerGenerator.js";
import {
  resetTeamIdCounter,
  setTeamIdCounter,
} from "../../src/generators/teamGenerator.js";
import { SCHEME_LABELS } from "../../src/schemes.js";
import { computeTeamUnits } from "../../src/sim/units.js";
import { DraftScreen } from "./DraftScreen.js";
import { ReviewScreen, RunOverScreen } from "./EndScreens.js";
import { RosterScreen } from "./RosterScreen.js";
import { SchemeSelectScreen } from "./SchemeSelect.js";
import { SeasonScreen } from "./SeasonScreen.js";

type Stage = "start" | "pickTeam" | "preseason" | "play";
type Tab = "season" | "roster" | "draft";

export default function App() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [session, setSession] = useState<GameSession | null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | undefined>(() =>
    loadCoachProfileFromBrowser(),
  );
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
    const created = createSession(seed, undefined, 32, coachProfile);
    // A first-ever run has no profile yet; the hire is the coach's identity.
    if (!coachProfile) {
      const fresh = createCoachProfile(yourTeam(created).coach.name);
      setCoachProfile(fresh);
      saveCoachProfileToBrowser(fresh);
    }
    setSession(created);
    setStage("pickTeam");
  };

  /**
   * Ends a run and folds it into the coach's career (Step 5): firing ends the
   * franchise — patience, reputation, that team's history — but the coach
   * carries their seasons, record, and rings into the next run.
   */
  const endRun = () => {
    if (session) {
      const merged = mergeRunIntoProfile(coachProfile ?? createCoachProfile("Coach"), runLegacy(session));
      setCoachProfile(merged);
      saveCoachProfileToBrowser(merged);
    }
    clearBrowserSave();
    setSession(null);
    setReviewPending(false);
    setStage("start");
    setTab("season");
  };

  const continueRun = () => {
    const loaded = loadFromBrowser();
    if (loaded.ok) {
      // A fresh page starts the module id counters at 1; the run's stored
      // cursor must win, or minting new players would collide with old ids.
      setPlayerIdCounter(loaded.session.idCursor?.player ?? 1);
      setTeamIdCounter(loaded.session.idCursor?.team ?? 1);
      setSession(loaded.session);
      setStage(loaded.session.phase === "preseason" ? "preseason" : "play");
      setTab(loaded.session.phase === "draft" ? "draft" : "season");
    }
  };

  if (stage === "start" || !session) {
    return (
      <div className="app center-screen">
        <h1 className="title">FOOTBALL ROGUE</h1>
        <p className="subtitle">One franchise. Ownership is not patient.</p>
        {coachProfile && (
          <p className="muted">
            Coach {coachProfile.name} — {coachProfile.careerRecord.wins}-
            {coachProfile.careerRecord.losses}-
            {coachProfile.careerRecord.ties} career, {coachProfile.championships}{" "}
            {coachProfile.championships === 1 ? "ring" : "rings"},{" "}
            {coachProfile.experience} seasons, Scouting T{tierForExperience(coachProfile.experience)}.
          </p>
        )}
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
                pickTeam(session, team.id);
                saveToBrowser(session);
                setStage("preseason");
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

  if (stage === "preseason") {
    return (
      <SchemeSelectScreen
        session={session}
        act={act}
        onStart={() => {
          setStage("play");
          setTab("season");
        }}
        onAbandon={endRun}
      />
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
    const career = mergeRunIntoProfile(
      coachProfile ?? createCoachProfile(yourTeam(session).coach.name),
      runLegacy(session),
    );
    return <RunOverScreen session={session} career={career} onNewRun={endRun} />;
  }

  const effectiveTab: Tab = tab === "draft" && session.phase !== "draft" ? "season" : tab;
  const team = yourTeam(session);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">FOOTBALL ROGUE</span>
        <span className="you">
          {team.name} · Season {session.franchise.season} · Coach {team.coach.name} (Scouting T
          {tierForExperience(team.coach.experience)})
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
        <button className="btn small danger" onClick={endRun}>
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
