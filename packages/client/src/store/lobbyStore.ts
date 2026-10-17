// Everything the screens know about the room, in one place. Screens read from
// the store and call its actions. Only this file talks to the connector.
import { createStore } from "zustand/vanilla";
import {
  type AvatarId,
  type GameSettings,
  type GameUpdate,
  type LobbySnapshot,
  type RoomClosedReason,
  type RoomErrorCode,
} from "@golf/shared";
import type { Connector, RoomHandle } from "../net/types";
import { clearSession, loadSession, saveSession } from "../net/storage";

export interface LobbyState {
  /** `connecting` covers the moment between pressing a button and being in the room. */
  readonly connection: "idle" | "connecting" | "connected";
  readonly code: string | null;
  /** Our own id. We have a seat once it appears in `lobby.players`. */
  readonly myId: string | null;
  readonly lobby: LobbySnapshot | null;
  readonly game: GameUpdate | null;
  /** The latest refusal from the server, for the screen to show. */
  readonly error: RoomErrorCode | null;
  /** Why we ended up back at the start, shown once on the landing page. */
  readonly notice: string | null;

  /** Make a room and be its host. Resolves to the code, or `null` if it failed. */
  createRoom(settings: GameSettings): Promise<string | null>;
  /** Check a code and connect. Resolves to `true` once we are in the waiting room. */
  joinRoom(code: string): Promise<boolean>;
  /** Be back in the room we were in before a refresh, if it is still there. */
  resume(code: string): Promise<boolean>;
  ready(name: string, avatar: AvatarId): void;
  start(): void;
  leave(): Promise<void>;
  dismissError(): void;
  dismissNotice(): void;
}

const IDLE = {
  connection: "idle",
  code: null,
  myId: null,
  lobby: null,
  game: null,
  error: null,
} as const;

const CLOSED_NOTICE: Record<RoomClosedReason, string> = {
  HOST_LEFT: "The host left, so the room was closed.",
  TIMED_OUT: "You were removed from the room for taking too long to get ready.",
  GAME_STARTED: "The game started without you.",
};

const STATUS_NOTICE = {
  missing: "We could not find a room with that code.",
  full: "That room is full.",
  started: "That game has already started.",
} as const;

export function createLobbyStore(connector: Connector) {
  let room: RoomHandle | null = null;
  let closedReason: RoomClosedReason | null = null;

  const store = createStore<LobbyState>((set, get) => {
    /** Wire up a fresh connection and show it. */
    const attach = (handle: RoomHandle): void => {
      room = handle;
      closedReason = null;
      saveSession({ code: handle.code, token: handle.reconnectionToken });
      set({
        connection: "connected",
        code: handle.code,
        myId: handle.sessionId,
        lobby: null,
        game: null,
        error: null,
        notice: null,
      });
      handle.on("lobby", (lobby) => {
        if (room === handle) set({ lobby });
      });
      handle.on("game", (game) => {
        if (room === handle) set({ game });
      });
      handle.on("error", ({ code }) => {
        if (room === handle) set({ error: code });
      });
      handle.on("closed", ({ reason }) => {
        if (room === handle) closedReason = reason;
      });
      handle.onLeave(() => {
        if (room !== handle) return;
        room = null;
        clearSession();
        set({
          ...IDLE,
          notice: closedReason === null ? null : CLOSED_NOTICE[closedReason],
        });
      });
    };

    const fail = (notice: string): void => set({ ...IDLE, notice });

    return {
      ...IDLE,
      notice: null,

      async createRoom(settings) {
        set({ connection: "connecting", error: null, notice: null });
        try {
          attach(await connector.createRoom(settings));
          return get().code;
        } catch {
          fail("Could not create a room. Is the server running?");
          return null;
        }
      },

      async joinRoom(code) {
        set({ connection: "connecting", error: null, notice: null });
        const status = await connector.roomStatus(code);
        if (status !== "open") {
          fail(STATUS_NOTICE[status]);
          return false;
        }
        try {
          attach(await connector.joinRoom(code));
          return true;
        } catch {
          fail("Could not join that room.");
          return false;
        }
      },

      async resume(code) {
        // Asking twice (React does in development) must not connect twice.
        if (get().connection !== "idle")
          return get().connection === "connected";
        const saved = loadSession();
        if (saved?.code === code) {
          set({ connection: "connecting", error: null, notice: null });
          try {
            attach(await connector.reconnect(saved.token));
            return true;
          } catch {
            clearSession();
          }
        }
        return get().joinRoom(code);
      },

      ready(name, avatar) {
        set({ error: null });
        room?.send("ready", { name, avatar });
      },

      start() {
        set({ error: null });
        room?.send("start");
      },

      async leave() {
        const handle = room;
        room = null;
        clearSession();
        set({ ...IDLE, notice: null });
        await handle?.leave();
      },

      dismissError: () => set({ error: null }),
      dismissNotice: () => set({ notice: null }),
    };
  });

  return store;
}

export type LobbyStore = ReturnType<typeof createLobbyStore>;
