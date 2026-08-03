import type { Position } from "../types.js";
import type { AttributeKey } from "./attributes.js";

/**
 * Skill trees are how development points become on-field ability. Nodes add
 * flat bonuses to the attributes the sim already reads, so a spent point
 * shows up in unit ratings, in the play engine, and on the scoreboard.
 *
 * Each tier offers mutually exclusive choices and you may take one per tier,
 * in order. That forces specialization rather than letting every player
 * eventually take everything — a receiver becomes a route technician *or* a
 * deep threat, and which one is right depends on the scheme he plays in
 * (see DESIGN.md §6.1).
 */
export interface SkillNode {
  id: string;
  name: string;
  description: string;
  /** 1-based; a tier is only reachable once the one below it is taken. */
  tier: number;
  cost: number;
  modifiers: Partial<Record<AttributeKey, number>>;
}

export const TIER_COSTS: readonly number[] = [80, 200, 380];

function node(
  position: Position,
  tier: number,
  id: string,
  name: string,
  description: string,
  modifiers: Partial<Record<AttributeKey, number>>,
): SkillNode {
  return {
    id: `${position}_t${tier}_${id}`,
    name,
    description,
    tier,
    cost: TIER_COSTS[tier - 1] ?? 999,
    modifiers,
  };
}

/** Tiers of mutually exclusive choices, in order. */
export type SkillTree = readonly (readonly SkillNode[])[];

export const SKILL_TREES: Record<Position, SkillTree> = {
  QB: [
    [
      node("QB", 1, "quickRelease", "Quick Release", "Gets the ball out before the rush arrives.", { throwAccuracyShort: 6, playAction: 3 }),
      node("QB", 1, "cannon", "Cannon", "Drives the ball down the field.", { throwPower: 7, throwAccuracyDeep: 4 }),
      node("QB", 1, "mobile", "Mobile", "Comfortable throwing on the move.", { speed: 6, throwOnRun: 5 }),
    ],
    [
      node("QB", 2, "fieldVision", "Field Vision", "Reads the whole field before the snap.", { awareness: 7, playAction: 5 }),
      node("QB", 2, "deepTouch", "Deep Touch", "Drops the deep ball in the bucket.", { throwAccuracyDeep: 8, throwPower: 3 }),
      node("QB", 2, "escapeArtist", "Escape Artist", "Slips pressure and extends plays.", { elusiveness: 7, throwOnRun: 6 }),
    ],
    [
      node("QB", 3, "surgical", "Surgical", "Places the short and intermediate throw perfectly.", { throwAccuracyShort: 9, awareness: 5 }),
      node("QB", 3, "gunslinger", "Gunslinger", "Fits the ball into windows nobody else sees.", { throwPower: 8, throwAccuracyDeep: 7 }),
      node("QB", 3, "dualThreat", "Dual Threat", "A defense has to account for his legs on every snap.", { speed: 7, throwOnRun: 8 }),
    ],
  ],
  RB: [
    [
      node("RB", 1, "powerSteps", "Power Steps", "Falls forward through contact.", { breakTackle: 7, strength: 4 }),
      node("RB", 1, "jumpCut", "Jump Cut", "Changes direction without losing speed.", { elusiveness: 7, agility: 4 }),
      node("RB", 1, "softHands", "Soft Hands", "A genuine receiving option out of the backfield.", { catching: 8 }),
    ],
    [
      node("RB", 2, "contactBalance", "Contact Balance", "Stays upright through the first hit.", { breakTackle: 8, carrying: 4 }),
      node("RB", 2, "homeRunSpeed", "Home Run Speed", "Takes it the distance once he is clear.", { speed: 7, acceleration: 5 }),
      node("RB", 2, "routeBack", "Route Back", "Runs real routes, not just check-downs.", { routeRunning: 8, catching: 4 }),
    ],
    [
      node("RB", 3, "bulldozer", "Bulldozer", "Moves the pile by himself.", { breakTackle: 9, strength: 6, impactBlock: 4 }),
      node("RB", 3, "untouchable", "Untouchable", "Defenders cannot get a clean hand on him.", { elusiveness: 10, agility: 6 }),
      node("RB", 3, "mismatch", "Mismatch", "A linebacker cannot cover him.", { catching: 9, routeRunning: 7 }),
    ],
  ],
  WR: [
    [
      node("WR", 1, "crispRoutes", "Crisp Routes", "Sharp breaks create separation.", { routeRunning: 7 }),
      node("WR", 1, "burner", "Burner", "Runs past defensive backs.", { speed: 7, acceleration: 4 }),
      node("WR", 1, "strongHands", "Strong Hands", "Catches what reaches him.", { catching: 7 }),
    ],
    [
      node("WR", 2, "zoneBeater", "Zone Beater", "Finds the soft spot and sits down in it.", { routeRunning: 8, awareness: 4 }),
      node("WR", 2, "deepSeparation", "Deep Separation", "Beats press and stacks the corner.", { speed: 6, release: 6 }),
      node("WR", 2, "contestedCatch", "Contested Catch", "Wins the ball with a defender draped on him.", { catchInTraffic: 9, strength: 4 }),
    ],
    [
      node("WR", 3, "routeTechnician", "Route Technician", "Gets open against anything a zone shows.", { routeRunning: 10, release: 6 }),
      node("WR", 3, "deepThreat", "Deep Threat", "Bends the whole coverage his way.", { speed: 8, catching: 6 }),
      node("WR", 3, "possessionWeapon", "Possession Weapon", "The throw you make on third down.", { catchInTraffic: 10, catching: 6 }),
    ],
  ],
  TE: [
    [
      node("TE", 1, "seamRunner", "Seam Runner", "Threatens the middle of the field.", { routeRunning: 7 }),
      node("TE", 1, "anchor", "Anchor", "Holds the edge in the run game.", { runBlock: 7, strength: 4 }),
    ],
    [
      node("TE", 2, "reliableTarget", "Reliable Target", "The safety valve who always comes down with it.", { catching: 8, catchInTraffic: 5 }),
      node("TE", 2, "sealer", "Sealer", "Seals the backside and springs the run.", { runBlock: 8, impactBlock: 5 }),
    ],
    [
      node("TE", 3, "moveTightEnd", "Move Tight End", "Split him out and someone is overmatched.", { routeRunning: 9, catching: 7 }),
      node("TE", 3, "sixthLineman", "Sixth Lineman", "An extra tackle who can also catch.", { runBlock: 10, passBlock: 7 }),
    ],
  ],
  OL: [
    [
      node("OL", 1, "quickSet", "Quick Set", "Beats the rusher to the spot.", { passBlock: 7 }),
      node("OL", 1, "driveBlock", "Drive Block", "Moves defenders off the ball.", { runBlock: 7, strength: 3 }),
    ],
    [
      node("OL", 2, "anchorDown", "Anchor Down", "Does not give ground to a bull rush.", { passBlock: 8, strength: 5 }),
      node("OL", 2, "roadGrading", "Road Grading", "Opens running lanes by force.", { runBlock: 8, impactBlock: 5 }),
    ],
    [
      node("OL", 3, "blindsideWall", "Blindside Wall", "The quarterback never sees the rush.", { passBlock: 10, awareness: 6 }),
      node("OL", 3, "mauler", "Mauler", "Finishes every block on the ground.", { runBlock: 10, strength: 7 }),
    ],
  ],
  DL: [
    [
      node("DL", 1, "bullRush", "Bull Rush", "Walks the blocker into the quarterback.", { powerMoves: 7, strength: 4 }),
      node("DL", 1, "swimMove", "Swim Move", "Beats the block with hands and quickness.", { finesseMoves: 7, acceleration: 4 }),
      node("DL", 1, "twoGap", "Two Gap", "Controls the blocker and reads the play.", { blockShedding: 7 }),
    ],
    [
      node("DL", 2, "leverage", "Leverage", "Wins under the pads every time.", { powerMoves: 8, blockShedding: 5 }),
      node("DL", 2, "bend", "Bend", "Turns the corner flat to the quarterback.", { finesseMoves: 8, agility: 5 }),
      node("DL", 2, "immovable", "Immovable", "Two blockers still do not move him.", { blockShedding: 8, tackle: 5 }),
    ],
    [
      node("DL", 3, "unblockablePower", "Unblockable Power", "Single blocks are not enough.", { powerMoves: 10, strength: 7 }),
      node("DL", 3, "edgeSpeed", "Edge Speed", "Off the ball before the tackle is set.", { finesseMoves: 10, speed: 6 }),
      node("DL", 3, "wall", "Wall", "Nothing gets run at him.", { blockShedding: 10, tackle: 7 }),
    ],
  ],
  LB: [
    [
      node("LB", 1, "downhill", "Downhill", "Attacks the line the moment he reads run.", { tackle: 7, hitPower: 4 }),
      node("LB", 1, "dropIntoCoverage", "Drop Into Coverage", "Comfortable dropping into a zone.", { zoneCoverage: 7 }),
      node("LB", 1, "blitzTiming", "Blitz Timing", "Times the blitz to hit the gap clean.", { powerMoves: 6, finesseMoves: 5 }),
    ],
    [
      node("LB", 2, "sureTackler", "Sure Tackler", "Does not miss in space.", { tackle: 8, pursuit: 5 }),
      node("LB", 2, "zoneInstincts", "Zone Instincts", "Reads the quarterback's eyes.", { zoneCoverage: 8, playRecognition: 5 }),
      node("LB", 2, "greenDog", "Green Dog", "Rushes the instant his man stays in.", { finesseMoves: 7, pursuit: 6 }),
    ],
    [
      node("LB", 3, "thumper", "Thumper", "Ball carriers feel it all game.", { tackle: 10, hitPower: 8 }),
      node("LB", 3, "coverageBacker", "Coverage Backer", "Can run with a tight end all day.", { zoneCoverage: 10, manCoverage: 7 }),
      node("LB", 3, "designatedRusher", "Designated Rusher", "A pass rusher wearing a linebacker's number.", { powerMoves: 9, finesseMoves: 8 }),
    ],
  ],
  CB: [
    [
      node("CB", 1, "pressTechnique", "Press Technique", "Disrupts the route at the line.", { press: 7, manCoverage: 4 }),
      node("CB", 1, "zoneEyes", "Zone Eyes", "Plays the quarterback, not the receiver.", { zoneCoverage: 7 }),
      node("CB", 1, "recoverySpeed", "Recovery Speed", "Makes up ground when beaten.", { speed: 6, acceleration: 4 }),
    ],
    [
      node("CB", 2, "mirror", "Mirror", "Matches every break step for step.", { manCoverage: 8, agility: 5 }),
      node("CB", 2, "patternMatch", "Pattern Match", "Passes off routes without a beat.", { zoneCoverage: 8, playRecognition: 5 }),
      node("CB", 2, "ballSkills", "Ball Skills", "Times the break on the throw.", { playRecognition: 7, manCoverage: 4 }),
    ],
    [
      node("CB", 3, "lockdownMan", "Lockdown Man", "Erases a receiver one-on-one.", { manCoverage: 10, press: 7 }),
      node("CB", 3, "zoneMaster", "Zone Master", "Nothing completes into his area.", { zoneCoverage: 10, playRecognition: 8 }),
      node("CB", 3, "shutdownAthlete", "Shutdown Athlete", "Too fast and too long to throw at.", { speed: 8, manCoverage: 6 }),
    ],
  ],
  S: [
    [
      node("S", 1, "centerField", "Center Field", "Covers the deep middle alone.", { zoneCoverage: 7 }),
      node("S", 1, "boxSafety", "Box Safety", "An extra defender against the run.", { tackle: 7, hitPower: 4 }),
    ],
    [
      node("S", 2, "readTheQuarterback", "Read The Quarterback", "Breaks on the throw early.", { playRecognition: 8, zoneCoverage: 5 }),
      node("S", 2, "enforcer", "Enforcer", "Receivers hear footsteps.", { hitPower: 8, tackle: 5 }),
    ],
    [
      node("S", 3, "freeSafety", "Free Safety", "Takes away the deep half by himself.", { zoneCoverage: 10, speed: 6 }),
      node("S", 3, "strongSafety", "Strong Safety", "A linebacker with range.", { tackle: 10, hitPower: 8 }),
    ],
  ],
  K: [
    [
      node("K", 1, "legStrength", "Leg Strength", "Adds range to the field goal unit.", { kickPower: 8 }),
      node("K", 1, "consistency", "Consistency", "Same swing every time.", { kickAccuracy: 8 }),
    ],
    [
      node("K", 2, "range", "Range", "Live from beyond fifty.", { kickPower: 9 }),
      node("K", 2, "clutch", "Clutch", "Ice in the fourth quarter.", { kickAccuracy: 9 }),
    ],
    [
      node("K", 3, "cannonLeg", "Cannon Leg", "In range the moment he crosses midfield.", { kickPower: 11 }),
      node("K", 3, "automatic", "Automatic", "You stop watching the kick.", { kickAccuracy: 11 }),
    ],
  ],
  P: [
    [
      node("P", 1, "hangTime", "Hang Time", "Gives the coverage time to get there.", { kickAccuracy: 8 }),
      node("P", 1, "bigLeg", "Big Leg", "Flips the field on one swing.", { kickPower: 8 }),
    ],
    [
      node("P", 2, "placement", "Placement", "Drops it inside the twenty.", { kickAccuracy: 9 }),
      node("P", 2, "boomer", "Boomer", "Sixty yards when it is needed.", { kickPower: 9 }),
    ],
    [
      node("P", 3, "coffinCorner", "Coffin Corner", "Pins them inside the five.", { kickAccuracy: 11 }),
      node("P", 3, "fieldFlipper", "Field Flipper", "Turns bad field position into good.", { kickPower: 11 }),
    ],
  ],
};

const NODES_BY_ID = new Map<string, SkillNode>();
for (const tree of Object.values(SKILL_TREES)) {
  for (const tier of tree) {
    for (const skillNode of tier) NODES_BY_ID.set(skillNode.id, skillNode);
  }
}

export function getSkillNode(id: string): SkillNode | undefined {
  return NODES_BY_ID.get(id);
}

export function getSkillTree(position: Position): SkillTree {
  return SKILL_TREES[position];
}

/** Every node defined for a position, flattened. */
export function allNodesFor(position: Position): SkillNode[] {
  return SKILL_TREES[position].flatMap((tier) => [...tier]);
}
