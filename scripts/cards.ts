/**
 * Prints example player cards for each position so the attribute model can be
 * eyeballed directly.
 *
 *   npm run cards           # one card per position
 *   npm run cards -- CB     # every archetype at one position, side by side
 */
import { generatePlayer } from "../src/generators/playerGenerator.js";
import { generatePlayerName } from "../src/generators/names.js";
import { POSITION_ARCHETYPES } from "../src/models/archetypes.js";
import { renderPlayerCard } from "../src/models/playerCard.js";
import { SeededRng } from "../src/rng.js";
import type { Position } from "../src/types.js";

const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];

const rng = new SeededRng(2026);
const requested = process.argv[2]?.toUpperCase() as Position | undefined;

if (requested) {
  if (!ALL_POSITIONS.includes(requested)) {
    console.error(`Unknown position "${requested}". Try one of: ${ALL_POSITIONS.join(", ")}`);
    process.exit(1);
  }
  console.log(`Every ${requested} archetype, same talent distribution:\n`);
  for (const archetype of POSITION_ARCHETYPES[requested]) {
    const player = generatePlayer(requested, rng, generatePlayerName(rng), {
      archetypeId: archetype.id,
    });
    console.log(renderPlayerCard(player));
    console.log();
  }
} else {
  for (const position of ALL_POSITIONS) {
    const player = generatePlayer(position, rng, generatePlayerName(rng));
    console.log(renderPlayerCard(player));
    console.log();
  }
}
