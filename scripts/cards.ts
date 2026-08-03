/**
 * Prints example player cards so the attribute model can be eyeballed directly.
 *
 *   npm run cards                    # one card per position
 *   npm run cards -- CB              # every archetype at one position
 *   npm run cards -- CB cover2Zone   # same, rated inside a scheme
 *
 * With a scheme, stats are marked ^ (scheme is built around it), + (helps),
 * or - (this scheme wastes it), and the header shows the rating swing.
 */
import { generatePlayer } from "../src/generators/playerGenerator.js";
import { generatePlayerName } from "../src/generators/names.js";
import { POSITION_ARCHETYPES } from "../src/models/archetypes.js";
import { renderPlayerCard } from "../src/models/playerCard.js";
import { SCHEME_EMPHASIS, type SchemeId } from "../src/schemes.js";
import { SeededRng } from "../src/rng.js";
import type { Position } from "../src/types.js";

const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
const ALL_SCHEMES = Object.keys(SCHEME_EMPHASIS) as SchemeId[];

const rng = new SeededRng(2026);
const requestedPosition = process.argv[2]?.toUpperCase() as Position | undefined;
const requestedScheme = process.argv[3] as SchemeId | undefined;

if (requestedScheme && !ALL_SCHEMES.includes(requestedScheme)) {
  console.error(`Unknown scheme "${requestedScheme}". Try one of: ${ALL_SCHEMES.join(", ")}`);
  process.exit(1);
}

if (requestedPosition) {
  if (!ALL_POSITIONS.includes(requestedPosition)) {
    console.error(`Unknown position "${requestedPosition}". Try one of: ${ALL_POSITIONS.join(", ")}`);
    process.exit(1);
  }
  const context = requestedScheme ? ` in ${requestedScheme}` : "";
  console.log(`Every ${requestedPosition} archetype${context}:\n`);
  for (const archetype of POSITION_ARCHETYPES[requestedPosition]) {
    const player = generatePlayer(requestedPosition, rng, generatePlayerName(rng), {
      archetypeId: archetype.id,
    });
    console.log(renderPlayerCard(player, requestedScheme));
    console.log();
  }
} else {
  for (const position of ALL_POSITIONS) {
    const player = generatePlayer(position, rng, generatePlayerName(rng));
    console.log(renderPlayerCard(player, requestedScheme));
    console.log();
  }
}
