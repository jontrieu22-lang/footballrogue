import {
  playWeek,
  standings,
  yourTeam,
  REGULAR_SEASON_WEEKS,
  type GameSession,
} from "../../src/franchise/game.js";
import { expectedWins, MAX_PATIENCE } from "../../src/franchise/runState.js";
import { PLAYOFF_TEAMS } from "../../src/sim/playoffs.js";

export function Patience({ value }: { value: number }) {
  return (
    <span className="patience" title={`Ownership patience: ${value}/${MAX_PATIENCE}`}>
      {"♥".repeat(value)}
      <span className="patience-empty">{"♥".repeat(Math.max(0, MAX_PATIENCE - value))}</span>
    </span>
  );
}

export function SeasonScreen({
  session,
  act,
  onPlayoffs,
}: {
  session: GameSession;
  act: (mutate: () => void) => void;
  onPlayoffs: () => void;
}) {
  const team = yourTeam(session);
  const rows = standings(session);
  const lastWeek = session.weekLog[session.weekLog.length - 1];
  const target = expectedWins(session.franchise);
  const inSeason = session.phase === "regularSeason";

  const yourInjuries = lastWeek?.injuries.filter((i) => i.teamId === team.id) ?? [];

  let yourScoreLine: string | undefined;
  if (lastWeek?.yourGame) {
    const youWereHome = lastWeek.yourGame.homeTeamId === team.id;
    const yours = youWereHome ? lastWeek.yourGame.home.points : lastWeek.yourGame.away.points;
    const theirs = youWereHome ? lastWeek.yourGame.away.points : lastWeek.yourGame.home.points;
    const verb = lastWeek.youWon ? "beat" : yours === theirs ? "tied" : "lost to";
    yourScoreLine = `Week ${lastWeek.week}: ${verb} ${lastWeek.yourOpponentName} ${yours}–${theirs}`;
  }

  return (
    <div className="two-col">
      <section>
        <div className="panel">
          <div className="panel-head">
            <h3>
              {inSeason
                ? `Week ${session.week} of ${REGULAR_SEASON_WEEKS}`
                : "Regular season complete"}
            </h3>
            <div className="owner-line">
              Owner expects <strong>{target} wins</strong> · <Patience value={session.franchise.patience} />
            </div>
          </div>

          <div className="actions">
            <button
              className="btn primary"
              disabled={!inSeason}
              onClick={() => act(() => void playWeek(session))}
            >
              Play Week
            </button>
            <button
              className="btn"
              disabled={!inSeason}
              onClick={() =>
                act(() => {
                  while (session.phase === "regularSeason") playWeek(session);
                })
              }
            >
              Sim to Season End
            </button>
            {session.phase === "playoffs" && (
              <button className="btn primary" onClick={onPlayoffs}>
                Play the Postseason
              </button>
            )}
          </div>

          {yourScoreLine && (
            <p className={lastWeek?.youWon ? "result win" : "result loss"}>{yourScoreLine}</p>
          )}

          {yourInjuries.length > 0 && (
            <div className="injuries">
              <h4>Injury report</h4>
              {yourInjuries.map((injury) => (
                <div
                  key={injury.playerId}
                  className={injury.severity === "career-ending" ? "injury fatal" : "injury"}
                >
                  {injury.position} {injury.playerName} — {injury.description}
                  {injury.severity === "career-ending"
                    ? " (CAREER OVER)"
                    : ` (${injury.weeksOut} wk${injury.weeksOut === 1 ? "" : "s"})`}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="panel">
          <h3>Standings</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>PF</th>
                <th>PA</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.teamId}
                  className={
                    (row.teamId === team.id ? "you-row " : "") +
                    (index === PLAYOFF_TEAMS - 1 ? "playoff-line" : "")
                  }
                >
                  <td className="muted">{index + 1}</td>
                  <td>{row.teamName}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.ties}</td>
                  <td>{row.pointsFor}</td>
                  <td>{row.pointsAgainst}</td>
                  <td>{row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Top {PLAYOFF_TEAMS} make the postseason.</p>
        </div>
      </section>
    </div>
  );
}
