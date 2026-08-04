import type { GameSession } from "./game.js";
import type { CoachProfile } from "./coachProfile.js";
import { generateCoach } from "../generators/coachGenerator.js";
import { initialFamiliarity } from "../progression/familiarity.js";

/**
 * A run is plain data — no class instances, no Maps — so it round-trips
 * through JSON directly. The version tag lets a future save format be
 * detected rather than silently misread.
 *
 * v2: scoutingTier moved off the franchise onto the coach profile (Step 5).
 * v1 saves still load — normalizeSession strips the dead field.
 */
const SAVE_VERSION = 2;
const SUPPORTED_SAVE_VERSIONS = [1, 2];

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
  // v1 carried scoutingTier on the franchise; Step 5 moved it to the coach
  // profile, where it is derived from experience. Drop the dead field.
  if ("scoutingTier" in session.franchise) {
    delete (session.franchise as { scoutingTier?: number }).scoutingTier;
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
  // Familiarity arrived later still. Backfill from the team's season scheme,
  // which is what every team was playing when the save was written.
  for (const team of session.league?.teams ?? []) {
    if (team.familiarity !== undefined) continue;
    team.familiarity = initialFamiliarity(team.scheme.offense, team.scheme.defense);
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
  if (!SUPPORTED_SAVE_VERSIONS.includes(envelope.version ?? -1)) {
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

/**
 * The coach profile outlives runs on purpose (Step 5) — being fired clears
 * the run save, never this one. Its own slot and envelope keep the two
 * lifetimes distinct.
 */
const COACH_STORAGE_KEY = "footballrogue.coach.v1";

interface CoachEnvelope {
  version: number;
  savedAt: string;
  profile: CoachProfile;
}

export function serializeCoachProfile(profile: CoachProfile): string {
  const envelope: CoachEnvelope = {
    version: 1,
    savedAt: new Date().toISOString(),
    profile,
  };
  return JSON.stringify(envelope);
}

export type CoachLoadResult =
  | { ok: true; profile: CoachProfile }
  | { ok: false; reason: string };

export function deserializeCoachProfile(raw: string): CoachLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Coach profile is not valid JSON" };
  }
  const envelope = parsed as Partial<CoachEnvelope>;
  if (envelope.version !== 1 || !envelope.profile) {
    return { ok: false, reason: "Coach profile is missing or from a future version" };
  }
  if (
    typeof envelope.profile.name !== "string" ||
    typeof envelope.profile.experience !== "number" ||
    !envelope.profile.careerRecord
  ) {
    return { ok: false, reason: "Coach profile is malformed" };
  }
  return { ok: true, profile: envelope.profile };
}

export function saveCoachProfileToBrowser(profile: CoachProfile): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(COACH_STORAGE_KEY, serializeCoachProfile(profile));
    return true;
  } catch {
    return false;
  }
}

export function loadCoachProfileFromBrowser(): CoachProfile | undefined {
  const store = storage();
  if (!store) return undefined;
  const raw = store.getItem(COACH_STORAGE_KEY);
  if (!raw) return undefined;
  const loaded = deserializeCoachProfile(raw);
  return loaded.ok ? loaded.profile : undefined;
}
