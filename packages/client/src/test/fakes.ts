// A stand-in for the network, so screens and the store can be tested without a server.
import {
  DEFAULT_SETTINGS,
  type AvatarId,
  type GameSettings,
  type GameUpdate,
  type GameView,
  type LobbyPlayer,
  type LobbySnapshot,
  type RoomStatus,
  type ServerMessages,
  type ServerMessageType,
} from "@golf/shared";
import type { Connector, RoomHandle } from "../net/types";

type Handler = (message: never) => void;

export class FakeRoom implements RoomHandle {
  readonly sent: { type: string; payload: unknown }[] = [];
  left = false;
  readonly #handlers = new Map<string, Handler[]>();
  readonly #leaveHandlers: (() => void)[] = [];

  readonly code: string;
  readonly sessionId: string;
  readonly reconnectionToken: string;

  constructor(code: string, sessionId: string) {
    this.code = code;
    this.sessionId = sessionId;
    this.reconnectionToken = `token-${sessionId}`;
  }

  send(type: string, payload?: unknown): void {
    this.sent.push({ type, payload });
  }

  on<K extends ServerMessageType>(
    type: K,
    callback: (message: ServerMessages[K]) => void,
  ): void {
    this.#handlers.set(type, [
      ...(this.#handlers.get(type) ?? []),
      callback as Handler,
    ]);
  }

  onLeave(callback: () => void): void {
    this.#leaveHandlers.push(callback);
  }

  async leave(): Promise<void> {
    this.end();
  }

  /** Pretend the server sent something. */
  emit<K extends ServerMessageType>(type: K, message: ServerMessages[K]): void {
    for (const handler of this.#handlers.get(type) ?? []) {
      handler(message as never);
    }
  }

  /** Pretend the connection ended, whoever ended it. */
  end(): void {
    this.left = true;
    for (const handler of this.#leaveHandlers) handler();
  }

  sentOfType(type: string): unknown[] {
    return this.sent.filter((m) => m.type === type).map((m) => m.payload);
  }
}

export class FakeConnector implements Connector {
  status: RoomStatus = "open";
  failCreate = false;
  failJoin = false;
  failReconnect = false;
  readonly created: GameSettings[] = [];
  readonly joined: string[] = [];
  readonly reconnected: string[] = [];
  readonly rooms: FakeRoom[] = [];

  async createRoom(settings: GameSettings): Promise<RoomHandle> {
    if (this.failCreate) throw new Error("no server");
    this.created.push(settings);
    return this.#open("ABCDE", "me", settings);
  }

  async joinRoom(code: string): Promise<RoomHandle> {
    if (this.failJoin) throw new Error("refused");
    this.joined.push(code);
    return this.#open(code, "me", DEFAULT_SETTINGS, "host");
  }

  async reconnect(token: string): Promise<RoomHandle> {
    if (this.failReconnect) throw new Error("expired");
    this.reconnected.push(token);
    return this.#open("ABCDE", "me", DEFAULT_SETTINGS);
  }

  async roomStatus(): Promise<RoomStatus> {
    return this.status;
  }

  get room(): FakeRoom {
    const room = this.rooms.at(-1);
    if (room === undefined) throw new Error("nobody connected yet");
    return room;
  }

  /** Like the real server, say who is in the room as soon as we connect. */
  #open(
    code: string,
    sessionId: string,
    settings: GameSettings,
    hostId = sessionId,
  ): FakeRoom {
    const room = new FakeRoom(code, sessionId);
    this.rooms.push(room);
    setTimeout(
      () => room.emit("lobby", lobby([], { code, hostId }, settings)),
      0,
    );
    return room;
  }
}

export function player(
  id: string,
  name: string,
  avatar: AvatarId,
  extra: Partial<LobbyPlayer> = {},
): LobbyPlayer {
  return {
    id,
    name,
    avatar,
    isBot: false,
    connected: true,
    reconnectDeadline: null,
    ...extra,
  };
}

export function lobby(
  players: LobbyPlayer[],
  extra: Partial<LobbySnapshot> = {},
  settings: Partial<GameSettings> = {},
): LobbySnapshot {
  return {
    code: "ABCDE",
    hostId: "me",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players,
    started: false,
    serverTime: 0,
    ...extra,
  };
}

/** A game update wrapping `view`, as the server would send it. */
export function gameUpdate(view: GameView): GameUpdate {
  return {
    view,
    events: [],
    serverTime: 0,
    nextHoleAt: null,
    result: null,
  };
}
