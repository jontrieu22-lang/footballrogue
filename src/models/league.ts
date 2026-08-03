import type { Team } from "./team.js";

export interface ScheduledGame {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface League {
  season: number;
  teams: Team[];
  schedule: ScheduledGame[];
}
