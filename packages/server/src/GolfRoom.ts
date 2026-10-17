import {
  Room,
  ServerError,
  matchMaker,
  type Client,
  type Deferred,
} from "colyseus";
import {
  ActionSchema,
  CLIENT_MESSAGE,
  CreateOptionsSchema,
  ReadyPayloadSchema,
  type CreateOptions,
  type LobbySnapshot,
  type RoomClosedReason,
  type RoomErrorCode,
  type ServerMessages,
  type ServerMessageType,
} from "@golf/shared";
import { generateLobbyCode } from "./codes";
import { GameSession } from "./gameSession";

export interface GolfRoomConfig {
  /** Pause before a bot moves. */
  readonly botDelayMs?: number;
  /** How long a dropped player has to come back once it is their turn. */
  readonly reconnectGraceMs?: number;
  /** How long after a hole ends until the next one starts by itself. */
  readonly nextHoleDelayMs?: number;
  /** How long someone can sit in the waiting room without pressing Ready. */
  readonly readyTimeoutMs?: number;
  /** How long a host who dropped from the waiting room has to come back. */
  readonly hostReconnectMs?: number;
}
const MAX_CODE_ATTEMPTS = 20;
export const DEFAULT_HOST_RECONNECT_MS = 20 * 1000;

/** Bad requests are refused with a close code a client can read. */
const REJECTED = 4000;
/** A connection was dropped by the room, for example for never pressing Ready. */
const KICKED = 4001;

/**
 * A lobby and the game that follows. The room id is the lobby code, the
 * first client to connect is the host, and the host's settings are fixed when
 * the room is created. Connecting only gets you into the waiting room; a
 * player takes a seat by sending `ready` with a name and avatar.
 *
 * Use `createGolfRoom` to get a class with its config filled in.
 */
export class GolfRoom extends Room {
  protected config: GolfRoomConfig = {};
  #session!: GameSession;
  /** Reconnections we are holding open. The session decides when to give up on them. */
  #waiting = new Map<string, Deferred<Client>>();

  async onCreate(options: unknown): Promise<void> {
    const parsed = CreateOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(REJECTED, "BAD_OPTIONS");
    const { settings }: CreateOptions = parsed.data;

    this.roomId = await this.#freeLobbyCode();
    this.maxClients = settings.maxPlayers;
    this.maxMessagesPerSecond = 20;
    await this.setPrivate(settings.private);

    this.#session = new GameSession({
      code: this.roomId,
      settings,
      rng: Math.random,
      botDelayMs: this.config.botDelayMs,
      reconnectGraceMs: this.config.reconnectGraceMs,
      nextHoleDelayMs: this.config.nextHoleDelayMs,
      readyTimeoutMs: this.config.readyTimeoutMs,
      onTakeover: (id) => this.#giveUpWaiting(id),
      onKick: (id) => this.clients.getById(id)?.leave(KICKED),
      send: (id, type, message) => this.#send(id, type, message),
      onLobbyChange: (snapshot) => this.#updateListing(snapshot),
    });

    this.onMessage(CLIENT_MESSAGE.ready, (client, raw: unknown) => {
      const payload = ReadyPayloadSchema.safeParse(raw);
      if (!payload.success) {
        this.#send(client.sessionId, "error", { code: "BAD_MESSAGE" });
        return;
      }
      this.#session.ready(
        client.sessionId,
        payload.data.name,
        payload.data.avatar,
      );
    });

    this.onMessage(CLIENT_MESSAGE.start, (client) => {
      this.#session.start(client.sessionId);
      if (this.#session.started) void this.lock();
    });

    this.onMessage(CLIENT_MESSAGE.playAgain, (client) => {
      this.#session.playAgain(client.sessionId);
    });

    this.onMessage(CLIENT_MESSAGE.action, (client, raw: unknown) => {
      const action = ActionSchema.safeParse(raw);
      if (!action.success) {
        this.#send(client.sessionId, "error", { code: "BAD_MESSAGE" });
        return;
      }
      this.#session.act(client.sessionId, action.data);
    });
  }

  /** Refuse joining a room that is full or already playing. */
  onAuth(): true {
    const reason: RoomErrorCode | null = this.#session?.joinError() ?? null;
    if (reason !== null) throw new ServerError(REJECTED, reason);
    return true;
  }

  onJoin(client: Client): void {
    const error = this.#session.connect(client.sessionId);
    if (error !== null) throw new ServerError(REJECTED, error);
  }

  onDrop(client: Client): void {
    const id = client.sessionId;
    const wasHost = this.#session.hostId === id;
    this.#session.disconnect(id);
    if (this.#session.holdsSeatsOnDrop) {
      // "manual" means Colyseus waits until the session says the time is up.
      this.#waiting.set(id, this.allowReconnection(client, "manual"));
    } else if (wasHost && !this.#session.started) {
      // The waiting room closes when the host leaves, so give them a moment to
      // come back, for example after refreshing the page.
      const ms = this.config.hostReconnectMs ?? DEFAULT_HOST_RECONNECT_MS;
      this.#waiting.set(id, this.allowReconnection(client, ms / 1000));
    }
    // Anyone else in the waiting room is simply let go.
  }

  onReconnect(client: Client): void {
    this.#waiting.delete(client.sessionId);
    this.#session.reconnect(client.sessionId);
  }

  onLeave(client: Client): void {
    const id = client.sessionId;
    this.#waiting.delete(id);
    // Before the game the host is the room, so it closes with them. Once the
    // game is running, hosting passes on and a bot covers the seat.
    const hostLeftWaitingRoom =
      !this.#session.started && this.#session.hostId === id;
    this.#session.leave(id);
    if (hostLeftWaitingRoom) this.#close("HOST_LEFT");
  }

  onDispose(): void {
    this.#session?.dispose();
  }

  /** Tell everyone the room is over, then drop them. */
  #close(reason: RoomClosedReason): void {
    for (const other of this.clients) other.send("closed", { reason });
    void this.disconnect();
  }

  /** Stop holding a seat open for a player who did not come back. */
  #giveUpWaiting(id: string): void {
    this.#waiting.get(id)?.reject();
    this.#waiting.delete(id);
  }

  async #freeLobbyCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateLobbyCode();
      if ((await matchMaker.getRoomById(code)) === undefined) return code;
    }
    throw new ServerError(REJECTED, "NO_FREE_CODE");
  }

  #send<K extends ServerMessageType>(
    id: string,
    type: K,
    message: ServerMessages[K],
  ): void {
    this.clients.getById(id)?.send(type, message);
  }

  /** Keep the room listing current, for the public lobby list later. */
  #updateListing(snapshot: LobbySnapshot): void {
    const host = snapshot.players.find((p) => p.id === snapshot.hostId);
    void this.setMetadata({
      code: snapshot.code,
      hostName: host?.name ?? "",
      players: snapshot.players.length,
      maxPlayers: snapshot.settings.maxPlayers,
      started: snapshot.started,
    });
  }
}

/** A room class with `config` applied. The tests use this to skip the bot delay. */
export function createGolfRoom(config: GolfRoomConfig = {}): typeof GolfRoom {
  return class ConfiguredGolfRoom extends GolfRoom {
    protected override config = config;
  };
}
