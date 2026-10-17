// Small things we remember. The profile lives in localStorage so it is still
// there next visit. The reconnect token lives in sessionStorage, so it belongs
// to this tab only and goes away when the tab does.
import { AVATAR_IDS, PlayerNameSchema, type AvatarId } from "@golf/shared";

const PROFILE_KEY = "golf.profile";
const SESSION_KEY = "golf.session";

export interface Profile {
  readonly name: string;
  readonly avatar: AvatarId | null;
}

export interface SavedSession {
  readonly code: string;
  readonly token: string;
}

function read(storage: () => Storage, key: string): unknown {
  try {
    const raw = storage().getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown): void {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage are fine, we just forget.
  }
}

export function loadProfile(): Profile {
  const raw = read(() => localStorage, PROFILE_KEY);
  const name = PlayerNameSchema.safeParse(
    (raw as { name?: unknown } | null)?.name,
  );
  const avatar = (raw as { avatar?: unknown } | null)?.avatar;
  return {
    name: name.success ? name.data : "",
    avatar: AVATAR_IDS.find((id) => id === avatar) ?? null,
  };
}

export function saveProfile(profile: Profile): void {
  write(() => localStorage, PROFILE_KEY, profile);
}

export function loadSession(): SavedSession | null {
  const raw = read(
    () => sessionStorage,
    SESSION_KEY,
  ) as Partial<SavedSession> | null;
  return typeof raw?.code === "string" && typeof raw.token === "string"
    ? { code: raw.code, token: raw.token }
    : null;
}

export function saveSession(session: SavedSession): void {
  write(() => sessionStorage, SESSION_KEY, session);
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to forget.
  }
}
