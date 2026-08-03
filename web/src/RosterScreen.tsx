import { useState } from "react";
import { yourTeam, type GameSession } from "../../src/franchise/game.js";
import { computeOverall } from "../../src/models/player.js";
import { buildPlayerCard } from "../../src/models/playerCard.js";
import { unlockNode } from "../../src/progression/skills.js";
import { SCHEME_LABELS, schemeForPosition } from "../../src/schemes.js";
import { computeTeamUnits } from "../../src/sim/units.js";
import type { Position } from "../../src/types.js";

const POSITION_ORDER: Position[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];

function healthLabel(player: ReturnType<typeof yourTeam>["roster"][number]): string {
  if (player.health.status === "career-ending") return "career over";
  if (player.health.weeksOut > 0) return `out ${player.health.weeksOut}w`;
  return "";
}

export function RosterScreen({
  session,
  act,
}: {
  session: GameSession;
  act: (mutate: () => void) => void;
}) {
  const team = yourTeam(session);
  const units = computeTeamUnits(team);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...team.roster].sort((a, b) => {
    const positionDelta = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
    if (positionDelta !== 0) return positionDelta;
    return (
      computeOverall(b, schemeForPosition(b.position, team.scheme)) -
      computeOverall(a, schemeForPosition(a.position, team.scheme))
    );
  });

  const selected = team.roster.find((p) => p.id === selectedId) ?? sorted[0];
  const scheme = selected ? schemeForPosition(selected.position, team.scheme) : undefined;
  const card = selected ? buildPlayerCard(selected, scheme) : undefined;

  return (
    <div className="two-col">
      <section>
        <div className="panel">
          <div className="panel-head">
            <h3>Roster ({team.roster.length})</h3>
            <span className="muted small">
              {SCHEME_LABELS[team.scheme.offense]} · {SCHEME_LABELS[team.scheme.defense]} — pass off{" "}
              {units.passOffense.toFixed(0)}, rush off {units.rushOffense.toFixed(0)}, pass def{" "}
              {units.passDefense.toFixed(0)}, rush def {units.rushDefense.toFixed(0)}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Name</th>
                <th>Age</th>
                <th>OVR</th>
                <th>Fit</th>
                <th>Dev pts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((player) => (
                <tr
                  key={player.id}
                  className={player.id === selected?.id ? "you-row clickable" : "clickable"}
                  onClick={() => setSelectedId(player.id)}
                >
                  <td>{player.position}</td>
                  <td>{player.name}</td>
                  <td>{player.age}</td>
                  <td>{computeOverall(player)}</td>
                  <td>{computeOverall(player, schemeForPosition(player.position, team.scheme))}</td>
                  <td>{player.developmentPoints}</td>
                  <td className="injury-cell">{healthLabel(player)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        {card && selected && (
          <div className="panel player-card">
            <h3>
              {card.name} <span className="muted">· {card.position} · {card.archetype}</span>
            </h3>
            <p>
              Age {card.age} · OVR <strong>{card.overall}</strong>
              {card.schemeOverall !== undefined && (
                <>
                  {" "}
                  → <strong>{card.schemeOverall}</strong> in {card.schemeName}
                </>
              )}
            </p>

            <h4>General</h4>
            <div className="chips">
              {card.general.map((stat) => (
                <span key={stat.key} className={`chip ${stat.emphasis} ${stat.developed ? "dev" : ""}`}>
                  {stat.abbr} {stat.value}
                </span>
              ))}
            </div>

            {card.positionalSections.map((section) => (
              <div key={section.title}>
                <h4>{section.title}</h4>
                <div className="chips">
                  {section.stats.map((stat) => (
                    <span
                      key={stat.key}
                      className={`chip ${stat.emphasis} ${stat.developed ? "dev" : ""}`}
                    >
                      {stat.abbr} {stat.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <h4>
              Skills <span className="muted">· {card.developmentPoints} pts unspent</span>
            </h4>
            {card.skills.length > 0 && (
              <ul className="skill-list">
                {card.skills.map((skill) => (
                  <li key={skill.id}>
                    T{skill.tier} <strong>{skill.name}</strong>
                  </li>
                ))}
              </ul>
            )}
            {card.nextChoices.map((choice) => (
              <div key={choice.id} className="skill-choice">
                <button
                  className="btn small"
                  disabled={!choice.affordable}
                  onClick={() => act(() => void unlockNode(selected, choice.id))}
                >
                  T{choice.tier} {choice.name} — {choice.cost}
                </button>
                <span className="muted small">{choice.description}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
