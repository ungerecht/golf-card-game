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
  JoinOptionsSchema,
  type CreateOptions,
  type LobbySnapshot,
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
}
const MAX_CODE_ATTEMPTS = 20;

/** Bad requests are refused with a close code a client can read. */
const REJECTED = 4000;

/**
 * A lobby and the game that follows. The room id is the lobby code, the
 * first client to join is the host, and the host's settings are fixed when the
 * room is created.
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
      onTakeover: (id) => this.#giveUpWaiting(id),
      send: (id, type, message) => this.#send(id, type, message),
      onLobbyChange: (snapshot) => this.#updateListing(snapshot),
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

  /** Refuse bad names and avatars, and joining a room that is full or already playing. */
  onAuth(_client: Client, options: unknown): true {
    // The host's own join also passes through here, before the session exists.
    const parsed = JoinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(REJECTED, "BAD_OPTIONS");
    const reason: RoomErrorCode | null = this.#session?.joinError() ?? null;
    if (reason !== null) throw new ServerError(REJECTED, reason);
    return true;
  }

  onJoin(client: Client, options: unknown): void {
    const { name, avatar } = JoinOptionsSchema.parse(options);
    const error = this.#session.join(client.sessionId, name, avatar);
    if (error !== null) throw new ServerError(REJECTED, error);
    this.#session.sync(client.sessionId);
  }

  onDrop(client: Client): void {
    this.#session.disconnect(client.sessionId);
    // Only a game in progress is worth waiting for. Otherwise the seat is freed straight away.
    if (!this.#session.holdsSeatsOnDrop) return;
    // "manual" means Colyseus waits until the session says the time is up.
    this.#waiting.set(
      client.sessionId,
      this.allowReconnection(client, "manual"),
    );
  }

  onReconnect(client: Client): void {
    this.#waiting.delete(client.sessionId);
    this.#session.reconnect(client.sessionId);
  }

  onLeave(client: Client): void {
    this.#waiting.delete(client.sessionId);
    this.#session.leave(client.sessionId);
  }

  onDispose(): void {
    this.#session?.dispose();
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
