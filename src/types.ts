export type Position =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "OL"
  | "DL"
  | "LB"
  | "CB"
  | "S"
  | "K"
  | "P";

export type AttributeKey =
  | "speed"
  | "strength"
  | "awareness"
  | "throwing"
  | "catching"
  | "blocking"
  | "tackling"
  | "coverage"
  | "kicking";

export type OffenseSchemeId = "powerRun" | "airRaid" | "westCoast" | "rpo";
export type DefenseSchemeId = "base43" | "odd34" | "cover2Zone" | "blitzMan";

/**
 * How fast a team plays, which is a variance dial: a faster game fits more
 * possessions into the clock, letting the better team's edge compound;
 * grinding shrinks the game, letting one lucky break decide it.
 */
export type Tempo = "fast" | "balanced" | "grind";
