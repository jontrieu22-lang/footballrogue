import { Fragment, useState } from "react";
import {
  midseasonSwitchAvailable,
  setTeamScheme,
  startSeason,
  switchSchemeMidseason,
  yourTeam,
  type GameSession,
} from "../../src/franchise/game.js";
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES, SCHEME_LABELS } from "../../src/schemes.js";
import {
  computeSchemeMatrix,
  type SchemeComboRating,
} from "../../src/sim/units.js";
import type { DefenseSchemeId, OffenseSchemeId } from "../../src/types.js";

interface Combo {
  offense: OffenseSchemeId;
  defense: DefenseSchemeId;
}

function SchemeMatrix({
  rows,
  current,
  selected,
  onSelect,
  compact,
}: {
  rows: SchemeComboRating[];
  current: Combo;
  selected: Combo | null;
  onSelect: (offense: OffenseSchemeId, defense: DefenseSchemeId) => void;
  compact?: boolean;
}) {
  const byKey = new Map(rows.map((row) => [`${row.offense}|${row.defense}`, row]));
  const currentRow = byKey.get(`${current.offense}|${current.defense}`);
  const base = currentRow?.rating ?? 0;

  return (
    <div className={compact ? "scheme-matrix compact" : "scheme-matrix"}>
      <div className="matrix-corner" />
      {DEFENSE_SCHEMES.map((defense) => (
        <div key={defense} className="matrix-colhead">
          {SCHEME_LABELS[defense]}
        </div>
      ))}
      {OFFENSE_SCHEMES.map((offense) => (
        <Fragment key={offense}>
          <div className="matrix-rowhead">{SCHEME_LABELS[offense]}</div>
          {DEFENSE_SCHEMES.map((defense) => {
            const row = byKey.get(`${offense}|${defense}`);
            if (!row) return <div key={defense} />;
            const isSelected = selected?.offense === offense && selected?.defense === defense;
            const isCurrent = current.offense === offense && current.defense === defense;
            const delta = row.rating - base;
            const deltaClass = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
            return (
              <button
                key={defense}
                className={
                  "matrix-cell" + (isSelected ? " selected" : "") + (isCurrent ? " current" : "")
                }
                onClick={() => onSelect(offense, defense)}
              >
                <span className="matrix-rating">{row.rating.toFixed(1)}</span>
                {isCurrent ? (
                  <span className="matrix-delta">current</span>
                ) : (
                  <span className={`matrix-delta ${deltaClass}`}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function UnitDetails({ row }: { row?: SchemeComboRating }) {
  if (!row) return null;
  return (
    <div className="chips scheme-units">
      <span className="chip">Pass off {row.passOffense.toFixed(0)}</span>
      <span className="chip">Rush off {row.rushOffense.toFixed(0)}</span>
      <span className="chip">Pass def {row.passDefense.toFixed(0)}</span>
      <span className="chip">Rush def {row.rushDefense.toFixed(0)}</span>
      <span className="chip core">Overall {row.rating.toFixed(1)}</span>
    </div>
  );
}

/**
 * The preseason screen: every scheme combination, rated against this roster,
 * before the season locks in. Scheme fit is the cheapest lever the player has
 * (worth ~3 wins/season), and this is the first place they get to pull it.
 */
export function SchemeSelectScreen({
  session,
  act,
  onStart,
  onAbandon,
}: {
  session: GameSession;
  act: (mutate: () => void) => void;
  onStart: () => void;
  onAbandon: () => void;
}) {
  const team = yourTeam(session);
  const rows = computeSchemeMatrix(team);
  const [selected, setSelected] = useState<Combo | null>(null);
  const chosen = selected ?? { offense: team.scheme.offense, defense: team.scheme.defense };
  const chosenRow = rows.find(
    (row) => row.offense === chosen.offense && row.defense === chosen.defense,
  );

  return (
    <div className="app">
      <div className="panel scheme-select">
        <h2>Preseason — Choose Your Schemes</h2>
        <p className="muted">
          {team.name}. Each cell is how your roster rates in that offense × defense pair —
          schemes change <em>which traits count</em>, so the same squad is worth more in the
          scheme that fits it. Your current pair is marked “current”.
        </p>

        <SchemeMatrix
          rows={rows}
          current={team.scheme}
          selected={selected}
          onSelect={(offense, defense) => setSelected({ offense, defense })}
        />
        <UnitDetails row={chosenRow} />

        <div className="actions">
          <button className="btn" onClick={onAbandon}>
            Abandon
          </button>
          <button
            className="btn primary"
            onClick={() => {
              act(() => {
                setTeamScheme(session, chosen.offense, chosen.defense);
                startSeason(session);
              });
              onStart();
            }}
          >
            Lock in {SCHEME_LABELS[chosen.offense]} / {SCHEME_LABELS[chosen.defense]} and start
            the season
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The mid-season re-fit: one per year, for one patience point. The matrix is
 * the same one the preseason screen shows, so the cost is visible before the
 * player commits.
 */
export function MidseasonSchemePicker({
  session,
  act,
  onClose,
}: {
  session: GameSession;
  act: (mutate: () => void) => void;
  onClose: () => void;
}) {
  const team = yourTeam(session);
  const rows = computeSchemeMatrix(team);
  const [selected, setSelected] = useState<Combo | null>(null);
  const chosen = selected ?? { offense: team.scheme.offense, defense: team.scheme.defense };
  const chosenRow = rows.find(
    (row) => row.offense === chosen.offense && row.defense === chosen.defense,
  );

  return (
    <div className="panel scheme-switch">
      <div className="panel-head">
        <h4>Change scheme mid-season</h4>
        <span className="muted small">Costs 1 patience · once per season</span>
      </div>
      <SchemeMatrix
        rows={rows}
        current={team.scheme}
        selected={selected}
        onSelect={(offense, defense) => setSelected({ offense, defense })}
        compact
      />
      <UnitDetails row={chosenRow} />
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!midseasonSwitchAvailable(session)}
          onClick={() => {
            act(() => switchSchemeMidseason(session, chosen.offense, chosen.defense));
            onClose();
          }}
        >
          Spend 1 patience on {SCHEME_LABELS[chosen.offense]} / {SCHEME_LABELS[chosen.defense]}
        </button>
      </div>
    </div>
  );
}
