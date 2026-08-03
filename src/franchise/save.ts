import type { GameSession } from "./game.js";

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

  return { ok: true, session: envelope.session };
}

const STORAGE_KEY = "footballrogue.save.v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | undefined {
  return typeof globalThis !== "undefined" &&
    (globalThis as { localStorage?: StorageLike }).localStorage !== undefined
    ? (globalThis as unknown as { localStorage: StorageLike }).localStorage
    : undefined;
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
