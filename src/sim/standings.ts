import type { Team } from "../models/team.js";

export interface StandingsRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

/** Sorted best-record-first. Reverse this to get draft order (worst picks first). */
export function computeStandings(teams: Team[]): StandingsRow[] {
  return teams
    .map((team): StandingsRow => {
      const gamesPlayed = team.record.wins + team.record.losses + team.record.ties;
      const winPct = gamesPlayed === 0 ? 0 : (team.record.wins + team.record.ties * 0.5) / gamesPlayed;
      return {
        teamId: team.id,
        teamName: team.name,
        wins: team.record.wins,
        losses: team.record.losses,
        ties: team.record.ties,
        winPct,
        pointsFor: team.pointsFor,
        pointsAgainst: team.pointsAgainst,
        pointDiff: team.pointsFor - team.pointsAgainst,
      };
    })
    .sort((a, b) => b.winPct - a.winPct || b.pointDiff - a.pointDiff);
}

/** Reverse-standings draft order — worst record picks first, same as the real NFL. */
export function computeDraftOrder(teams: Team[]): StandingsRow[] {
  return [...computeStandings(teams)].reverse();
}
