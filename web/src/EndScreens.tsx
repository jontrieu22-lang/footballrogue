import { yourTeam, type GameSession } from "../../src/franchise/game.js";
import { scoutingTier, type CoachProfile } from "../../src/franchise/coachProfile.js";
import type { PlayoffGame } from "../../src/sim/playoffs.js";
import { Patience } from "./SeasonScreen.js";

function groupRounds(games: PlayoffGame[]): { name: string; games: PlayoffGame[] }[] {
  const rounds: { name: string; games: PlayoffGame[] }[] = [];
  for (const game of games) {
    const last = rounds[rounds.length - 1];
    if (last && last.name === game.roundName) last.games.push(game);
    else rounds.push({ name: game.roundName, games: [game] });
  }
  return rounds;
}

export function ReviewScreen({
  session,
  onContinue,
}: {
  session: GameSession;
  onContinue: () => void;
}) {
  const team = yourTeam(session);
  const playoffs = session.playoffs;
  const review = session.seasonReview;
  const nameOf = new Map(session.league.teams.map((t) => [t.id, t.name]));

  return (
    <div className="app">
      <div className="panel center-screen review">
        {playoffs && (
          <>
            <h2 className={playoffs.championId === team.id ? "champ-you" : ""}>
              {playoffs.championName} are champions
              {playoffs.championId === team.id ? " — that's you!" : ""}
            </h2>
            <div className="bracket">
              {groupRounds(playoffs.games).map((round) => (
                <div key={round.name} className="round">
                  <h4>{round.name}</h4>
                  {round.games.map((game, index) => (
                    <div key={index} className="bracket-game">
                      ({game.homeSeed}) {nameOf.get(game.homeTeamId)}{" "}
                      <strong>{game.result.home.points}</strong> –{" "}
                      <strong>{game.result.away.points}</strong> ({game.awaySeed}){" "}
                      {nameOf.get(game.awayTeamId)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {review && (
          <div className="owner-review">
            <h3>Ownership review</h3>
            <p>
              You went{" "}
              <strong>
                {review.record.wins}-{review.record.losses}-{review.record.ties}
              </strong>{" "}
              against a target of <strong>{review.record.expectedWins}</strong>.
            </p>
            <p className="review-message">“{review.message}”</p>
            <p>
              Patience: <Patience value={session.franchise.patience} />
            </p>
          </div>
        )}

        <button className="btn primary" onClick={onContinue}>
          {session.phase === "runOver" ? "Face the Music" : "Continue to the Draft"}
        </button>
      </div>
    </div>
  );
}

export function RunOverScreen({
  session,
  career,
  onNewRun,
}: {
  session: GameSession;
  career: CoachProfile;
  onNewRun: () => void;
}) {
  const franchise = session.franchise;
  return (
    <div className="app">
      <div className="panel center-screen">
        <h1 className="run-over">RUN OVER</h1>
        <p>{franchise.endReason}</p>

        <div className="career-summary">
          <h3>
            Coach {career.name}'s career
          </h3>
          <p>
            {career.careerRecord.wins}-{career.careerRecord.losses}-
            {career.careerRecord.ties} · {career.experience} seasons ·{" "}
            {career.championships} {career.championships === 1 ? "ring" : "rings"} · Scouting T
            {scoutingTier(career)} — carried into the next run.
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th>Record</th>
              <th>Target</th>
              <th>Playoffs</th>
              <th>Champion</th>
              <th>Patience</th>
            </tr>
          </thead>
          <tbody>
            {franchise.history.map((year) => (
              <tr key={year.season}>
                <td>{year.season}</td>
                <td>
                  {year.wins}-{year.losses}-{year.ties}
                </td>
                <td>{year.expectedWins}</td>
                <td>{year.madePlayoffs ? "✓" : "—"}</td>
                <td>{year.wonChampionship ? "🏆" : "—"}</td>
                <td>{year.patienceAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn primary" onClick={onNewRun}>
          Start a New Run
        </button>
      </div>
    </div>
  );
}
