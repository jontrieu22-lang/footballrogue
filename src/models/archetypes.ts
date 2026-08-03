import type { Position } from "../types.js";
import type { AttributeKey } from "./attributes.js";

/**
 * Archetypes give players within a position distinct identities. The
 * modifiers are added to the generated baseline before clamping, so a Power
 * Back and an Elusive Back are built from the same distribution but end up
 * good at different things.
 *
 * Modifiers are deliberately zero-sum-ish: every archetype trades strengths
 * against weaknesses, so no archetype is strictly better than another. What
 * makes one right is scheme fit (see schemes.ts) — a Road Grader is worth
 * more in a Power Run offense than in an Air Raid.
 */
export interface Archetype {
  id: string;
  name: string;
  modifiers: Partial<Record<AttributeKey, number>>;
}

export const POSITION_ARCHETYPES: Record<Position, readonly Archetype[]> = {
  QB: [
    {
      id: "fieldGeneral",
      name: "Field General",
      modifiers: { awareness: 10, throwAccuracyShort: 8, playAction: 8, speed: -10, agility: -8, throwPower: -4 },
    },
    {
      id: "strongArm",
      name: "Strong Arm",
      modifiers: { throwPower: 12, throwAccuracyDeep: 9, throwAccuracyShort: -5, speed: -6, throwOnRun: -3 },
    },
    {
      id: "scrambler",
      name: "Scrambler",
      modifiers: { speed: 12, agility: 10, throwOnRun: 10, acceleration: 8, throwAccuracyShort: -7, awareness: -8 },
    },
  ],
  RB: [
    {
      id: "powerBack",
      name: "Power Back",
      modifiers: { strength: 12, breakTackle: 12, carrying: 6, agility: -9, elusiveness: -10, speed: -5 },
    },
    {
      id: "elusiveBack",
      name: "Elusive Back",
      modifiers: { elusiveness: 12, agility: 10, acceleration: 8, speed: 5, strength: -11, breakTackle: -8 },
    },
    {
      id: "receivingBack",
      name: "Receiving Back",
      modifiers: { catching: 14, routeRunning: 8, vision: 4, strength: -8, breakTackle: -9, carrying: -4 },
    },
  ],
  WR: [
    {
      id: "deepThreat",
      name: "Deep Threat",
      modifiers: { speed: 12, acceleration: 9, release: 6, catchInTraffic: -11, routeRunning: -6, strength: -5 },
    },
    {
      id: "routeTechnician",
      name: "Route Technician",
      modifiers: { routeRunning: 13, release: 9, awareness: 6, speed: -9, strength: -5 },
    },
    {
      id: "possession",
      name: "Possession Receiver",
      modifiers: { catchInTraffic: 13, catching: 9, strength: 6, speed: -11, acceleration: -7 },
    },
  ],
  TE: [
    {
      id: "blockingTE",
      name: "Blocking Tight End",
      modifiers: { runBlock: 13, passBlock: 10, strength: 9, impactBlock: 6, catching: -10, routeRunning: -11, speed: -6 },
    },
    {
      id: "receivingTE",
      name: "Receiving Tight End",
      modifiers: { catching: 12, routeRunning: 11, speed: 6, catchInTraffic: 5, runBlock: -12, passBlock: -10, strength: -5 },
    },
  ],
  OL: [
    {
      id: "passProtector",
      name: "Pass Protector",
      modifiers: { passBlock: 12, agility: 8, awareness: 6, runBlock: -10, strength: -6, impactBlock: -4 },
    },
    {
      id: "roadGrader",
      name: "Road Grader",
      modifiers: { runBlock: 12, strength: 10, impactBlock: 8, passBlock: -11, agility: -7 },
    },
  ],
  DL: [
    {
      id: "powerRusher",
      name: "Power Rusher",
      modifiers: { powerMoves: 13, strength: 10, blockShedding: 5, finesseMoves: -12, speed: -7, acceleration: -5 },
    },
    {
      id: "speedRusher",
      name: "Speed Rusher",
      modifiers: { finesseMoves: 13, speed: 9, acceleration: 9, pursuit: 5, powerMoves: -12, strength: -10 },
    },
    {
      id: "runStopper",
      name: "Run Stopper",
      modifiers: { blockShedding: 12, tackle: 10, strength: 8, powerMoves: -5, finesseMoves: -9, speed: -8 },
    },
  ],
  LB: [
    {
      id: "coverageLB",
      name: "Coverage Linebacker",
      modifiers: { zoneCoverage: 13, manCoverage: 10, speed: 8, playRecognition: 6, hitPower: -11, tackle: -6, strength: -8 },
    },
    {
      id: "thumper",
      name: "Thumper",
      modifiers: { tackle: 12, hitPower: 12, strength: 9, zoneCoverage: -12, manCoverage: -11, speed: -6 },
    },
    {
      id: "blitzer",
      name: "Blitzer",
      modifiers: { powerMoves: 11, finesseMoves: 10, pursuit: 8, acceleration: 6, zoneCoverage: -11, manCoverage: -9, playRecognition: -5 },
    },
  ],
  CB: [
    {
      id: "manCorner",
      name: "Man Corner",
      modifiers: { manCoverage: 13, press: 11, agility: 8, acceleration: 5, zoneCoverage: -12, playRecognition: -7 },
    },
    {
      id: "zoneCorner",
      name: "Zone Corner",
      modifiers: { zoneCoverage: 13, playRecognition: 11, awareness: 8, manCoverage: -12, press: -10, agility: -4 },
    },
    {
      id: "slotCorner",
      name: "Slot Corner",
      modifiers: { agility: 11, acceleration: 9, manCoverage: 6, tackle: 6, press: -8, speed: -6, strength: -7 },
    },
  ],
  S: [
    {
      id: "freeSafety",
      name: "Free Safety",
      modifiers: { zoneCoverage: 13, speed: 9, playRecognition: 9, manCoverage: 4, tackle: -11, hitPower: -12, strength: -7 },
    },
    {
      id: "strongSafety",
      name: "Strong Safety",
      modifiers: { tackle: 12, hitPower: 13, strength: 9, zoneCoverage: -11, manCoverage: -9, speed: -6 },
    },
  ],
  K: [
    { id: "powerKicker", name: "Power Kicker", modifiers: { kickPower: 12, kickAccuracy: -9 } },
    { id: "accurateKicker", name: "Accurate Kicker", modifiers: { kickAccuracy: 12, kickPower: -9 } },
  ],
  P: [
    { id: "boomingPunter", name: "Booming Punter", modifiers: { kickPower: 12, kickAccuracy: -9 } },
    { id: "coffinCorner", name: "Coffin Corner Punter", modifiers: { kickAccuracy: 12, kickPower: -9 } },
  ],
};
