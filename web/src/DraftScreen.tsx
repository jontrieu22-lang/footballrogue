import {
  beginDraft,
  draftPlayer,
  finishDraft,
  startNextSeason,
  yourPickIsUp,
  yourTeam,
  type GameSession,
} from "../../src/franchise/game.js";
import { isDraftComplete, DRAFT_ROUNDS } from "../../src/draft/draft.js";

const BOARD_SIZE = 40;

export function DraftScreen({
  session,
  act,
}: {
  session: GameSession;
  act: (mutate: () => void) => void;
}) {
  const team = yourTeam(session);
  const state = session.draft;

  if (!state) {
    return (
      <div className="panel center-screen">
        <h3>The offseason begins</h3>
        <p className="muted">
          A fresh rookie class awaits. Scouting is a guess, not a promise — the number on the board
          is what your scouts believe.
        </p>
        <button className="btn primary" onClick={() => act(() => void beginDraft(session))}>
          Enter the Draft Room
        </button>
      </div>
    );
  }

  const done = isDraftComplete(state);
  const myTurn = yourPickIsUp(session);
  const teamsInLeague = state.order.length / DRAFT_ROUNDS;
  const round = Math.floor(state.currentPick / teamsInLeague) + 1;
  const pickInRound = (state.currentPick % teamsInLeague) + 1;
  const myPicks = state.picks.filter((pick) => pick.teamId === team.id);

  return (
    <div className="two-col">
      <section>
        <div className="panel">
          <div className="panel-head">
            <h3>Draft board</h3>
            {!done && (
              <span className={myTurn ? "on-clock" : "muted"}>
                Round {round}, pick {pickInRound}
                {myTurn ? " — you are on the clock" : ""}
              </span>
            )}
            {done && <span className="muted">Draft complete</span>}
          </div>

          {!done && (
            <div className="actions">
              <button className="btn" onClick={() => act(() => finishDraft(session))}>
                Auto-draft the rest
              </button>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Name</th>
                <th>Age</th>
                <th>Archetype</th>
                <th>Scouted</th>
                <th>Ceiling</th>
                {myTurn && <th></th>}
              </tr>
            </thead>
            <tbody>
              {state.available.slice(0, BOARD_SIZE).map((prospect) => (
                <tr key={prospect.player.id}>
                  <td>{prospect.player.position}</td>
                  <td>{prospect.player.name}</td>
                  <td>{prospect.player.age}</td>
                  <td className="muted">{prospect.player.archetypeName}</td>
                  <td>
                    {prospect.scoutedOverall}
                    <span className="muted small"> ±{prospect.uncertainty}</span>
                  </td>
                  <td>{prospect.scoutedPotential}</td>
                  {myTurn && (
                    <td>
                      <button
                        className="btn small primary"
                        onClick={() => act(() => void draftPlayer(session, prospect.player.id))}
                      >
                        Draft
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="panel">
          <h3>Your picks</h3>
          {myPicks.length === 0 && <p className="muted">None yet.</p>}
          <ul className="pick-list">
            {myPicks.map((pick) => (
              <li key={pick.playerId}>
                R{pick.round}.{pick.pickInRound} — {pick.position} {pick.playerName}{" "}
                <span className="muted small">
                  scouted {pick.scoutedOverall}, actually {pick.trueOverall}
                </span>
              </li>
            ))}
          </ul>

          {done && (
            <div className="actions">
              <button
                className="btn primary"
                onClick={() => act(() => startNextSeason(session))}
              >
                Start Next Season
              </button>
              <p className="muted small">
                Rosters age, the injured retire, and the league resets to week one.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
