import type { GameSession } from "./game.js";
import { generateCoach } from "../generators/coachGenerator.js";

/**
 * A run is plain data — no class instances, no Maps — so it round-trips
 * through JSON directly. The version tag lets a future save format be
 * detected rather than silently misread.
 */
const SAVE_VERSION = 1;

interface SaveEnvelope {
  version: number;
  savedAt: string;
  session: GameSession;
}

export function serializeSession(session: GameSession): string {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    session,
  };
  return JSON.stringify(envelope);
}

export type LoadResult =
  | { ok: true; session: GameSession }
  | { ok: false; reason: string };

/**
 * Scans the ids that already exist so an old save — written before the run
 * carried its own id cursor — can resume minting after the largest one rather
 * than colliding with it.
 */
function cursorFromExisting(session: GameSession): { player: number; team: number } {
  let playerMax = 0;
  let teamMax = 0;
  const note = (id: string, prefix: string) => {
    if (!id.startsWith(prefix)) return;
    const value = Number(id.slice(prefix.length));
    if (!Number.isFinite(value)) return;
    if (prefix === "p" && value > playerMax) playerMax = value;
    if (prefix === "t" && value > teamMax) teamMax = value;
  };

  for (const team of session.league?.teams ?? []) {
    note(team.id, "t");
    for (const player of team.roster ?? []) note(player.id, "p");
  }
  for (const prospect of session.draftClass?.prospects ?? []) {
    note(prospect.player.id, "p");
  }

  return { player: playerMax + 1, team: teamMax + 1 };
}

/** Backfills fields added after the first save format so older runs still load. */
function normalizeSession(session: GameSession): void {
  if (!session.franchise) return;
  if (typeof session.franchise.schemeSwitchUsed !== "boolean") {
    session.franchise.schemeSwitchUsed = false;
  }
  if (
    !session.idCursor ||
    typeof session.idCursor.player !== "number" ||
    typeof session.idCursor.team !== "number"
  ) {
    session.idCursor = cursorFromExisting(session);
  }
  // Coaches arrived after the first save format. The human team was hired
  // fresh (experience 0); AI teams get the usual spread. Deterministic from
  // each team id, so reloading an old save always restores the same coaches.
  for (const team of session.league?.teams ?? []) {
    if (team.coach?.experience !== undefined) continue;
    const experience = team.id === session.franchise.teamId ? 0 : undefined;
    team.coach = generateCoach(team.id, experience);
  }
}

export function deserializeSession(raw: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Save file is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "Save file is empty or malformed" };
  }

  const envelope = parsed as Partial<SaveEnvelope>;
  if (envelope.version !== SAVE_VERSION) {
    return { ok: false, reason: `Save is version ${envelope.version ?? "unknown"}, expected ${SAVE_VERSION}` };
  }
  if (!envelope.session?.league?.teams?.length) {
    return { ok: false, reason: "Save does not contain a league" };
  }

  normalizeSession(envelope.session);
  return { ok: true, session: envelope.session };
}

const STORAGE_KEY = "footballrogue.save.v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | undefined {
  // Merely *touching* localStorage throws a SecurityError in sandboxed
  // iframes (embeds, artifact hosts), so the probe itself needs the try.
  try {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!candidate) return undefined;
    candidate.getItem("__probe__");
    return candidate;
  } catch {
    return undefined;
  }
}

export function saveToBrowser(session: GameSession): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, serializeSession(session));
    return true;
  } catch {
    // Quota exhausted or storage disabled — the caller decides what to say.
    return false;
  }
}

export function loadFromBrowser(): LoadResult {
  const store = storage();
  if (!store) return { ok: false, reason: "No browser storage available" };
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return { ok: false, reason: "No saved run found" };
  return deserializeSession(raw);
}

export function clearBrowserSave(): void {
  storage()?.removeItem(STORAGE_KEY);
}

export function hasBrowserSave(): boolean {
  return storage()?.getItem(STORAGE_KEY) != null;
}
