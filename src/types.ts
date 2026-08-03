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
