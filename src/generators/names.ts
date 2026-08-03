import type { SeededRng } from "../rng.js";

const FIRST_NAMES = [
  "James", "Marcus", "Devon", "Tyler", "Jordan", "Elijah", "Caleb", "Xavier",
  "Isaiah", "Malik", "Trevor", "Brandon", "Cameron", "Dominic", "Jalen",
  "Austin", "Derek", "Chase", "Miles", "Aaron", "Reggie", "Corey", "Terrell",
  "Kyle", "Blake", "Antoine", "Damian", "Ezekiel", "Julian", "Nathaniel",
];

const LAST_NAMES = [
  "Carter", "Washington", "Reynolds", "Griffin", "Coleman", "Barrett",
  "Sullivan", "Mercer", "Hayes", "Foster", "Whitfield", "Donovan", "Pierce",
  "Sanders", "Holloway", "Bishop", "Kendrick", "Vaughn", "Blackwood",
  "Ellison", "Marsh", "Rourke", "Tanner", "Osei", "Delgado", "Nakamura",
  "Okafor", "Petrov", "Callahan", "Winston",
];

const CITY_NAMES = [
  "Ironport", "Redwood", "Sable Bay", "Granite Falls", "Crestview",
  "Havenwood", "Millbrook", "Stonegate", "Fairhaven", "Cascade",
  "Brightmoor", "Ashford", "Wolfpine", "Rivergate", "Thornbury",
];

const TEAM_NICKNAMES = [
  "Hawks", "Wolves", "Bears", "Sentinels", "Marauders", "Titans",
  "Comets", "Rangers", "Vipers", "Ironclads", "Outlaws", "Foxes",
  "Storm", "Raptors", "Wardens",
];

export function generatePlayerName(rng: SeededRng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function generateTeamName(rng: SeededRng): string {
  return `${rng.pick(CITY_NAMES)} ${rng.pick(TEAM_NICKNAMES)}`;
}
