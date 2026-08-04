import type { Coach } from "../models/coach.js";
import { FIRST_NAMES, LAST_NAMES } from "./names.js";

/**
 * Upper bound on AI coaching careers in seasons. Reads max out around 60%
 * by the end of one, so 0-19 spans the whole curve.
 */
const MAX_AI_EXPERIENCE = 20;

/**
 * Coach identity is a pure function of the team id — deliberately *not* drawn
 * from the shared generation rng. Team generation hands every roster the same
 * rng stream; consuming draws for the coach would shift every roster after
 * the first and quietly change balance. The weekly game plan adds information
 * (coaches, reads, scouting), not a balance change, so it must leave the
 * roster stream untouched.
 */
function coachSeed(teamId: string): number {
  // djb2 over the id, then a 32-bit avalanche so sequential ids like "t1" and
  // "t2" land on well-separated values.
  let hash = 5381;
  for (let i = 0; i < teamId.length; i++) {
    hash = ((hash * 33) ^ teamId.charCodeAt(i)) >>> 0;
  }
  let x = hash;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/**
 * Generates a coach for a team. The human team's coach is a fresh hire on a
 * new run (see createSession in src/franchise/game.ts) and later carries a
 * fraction of its career forward — Step 5 of the weekly game plan spec.
 */
export function generateCoach(teamId: string, experience?: number): Coach {
  const seed = coachSeed(teamId);
  return {
    id: `${teamId}-coach`,
    name: `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${
      LAST_NAMES[(seed >>> 8) % LAST_NAMES.length]
    }`,
    experience: experience ?? seed % MAX_AI_EXPERIENCE,
  };
}
