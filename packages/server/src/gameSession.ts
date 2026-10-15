// Everything about one room that is not networking: who is seated, the lobby,
// running the game, and driving the bots. The Colyseus room is a thin wrapper
// around this, which keeps it easy to test without sockets.
import {
  AVATAR_IDS,
  applyAction,
  buildGameResult,
  chooseAction,
  createGame,
  getLegalActions,
  getPlayerView,
  type Action,
  type AvatarId,
  type GameEvent,
  type GameResult,
  type GameSettings,
  type GameState,
  type LobbyPlayer,
  type LobbySnapshot,
  type PlayerId,
  type RoomErrorCode,
  type Rng,
  type ServerMessages,
  type ServerMessageType,
} from "@golf/shared";

export interface SessionOptions {
  readonly code: string;
  readonly settings: GameSettings;
  /** Shuffles, and bot decisions. Pass `Math.random` in production. */
  readonly rng: Rng;
  /** Deliver a message to one player. Players who are not connected can be ignored. */
  readonly send: <K extends ServerMessageType>(
    playerId: PlayerId,
    type: K,
    message: ServerMessages[K],
  ) => void;
  /** Pause before a bot moves, so people can follow along. */
  readonly botDelayMs?: number;
  /** Called after anything that changes the lobby snapshot. */
  readonly onLobbyChange?: (snapshot: LobbySnapshot) => void;
  /**
   * How long a dropped player has to come back once it is their turn, before a
   * bot takes over their seat.
   */
  readonly reconnectGraceMs?: number;
  /** How long after a hole ends until the next one starts by itself. */
  readonly nextHoleDelayMs?: number;
  /** Called when a bot takes over the seat of a player who did not come back. */
  readonly onTakeover?: (playerId: PlayerId) => void;
}

interface Seat {
  readonly id: PlayerId;
  readonly name: string;
  readonly avatar: AvatarId;
  isBot: boolean;
  connected: boolean;
  /** Running while a dropped player is holding up the game. */
  graceTimer: ReturnType<typeof setTimeout> | null;
  graceEndsAt: number | null;
}

export const DEFAULT_BOT_DELAY_MS = 900;
export const DEFAULT_RECONNECT_GRACE_MS = 2 * 60 * 1000;
export const DEFAULT_NEXT_HOLE_DELAY_MS = 30 * 1000;

export class GameSession {
  readonly #options: SessionOptions;
  readonly #seats: Seat[] = [];
  #hostId: PlayerId | null = null;
  #game: GameState | null = null;
  #botTimer: ReturnType<typeof setTimeout> | null = null;
  #nextHoleTimer: ReturnType<typeof setTimeout> | null = null;
  #nextHoleAt: number | null = null;
  /** The final scoresheet, written down the moment the game ends. */
  #result: GameResult | null = null;
  #disposed = false;

  constructor(options: SessionOptions) {
    this.#options = options;
  }

  get started(): boolean {
    return this.#game !== null;
  }

  get game(): GameState | null {
    return this.#game;
  }

  get isOver(): boolean {
    return this.#game?.phase.type === "gameOver";
  }

  /** Whether a player who drops now should get a chance to come back. */
  get holdsSeatsOnDrop(): boolean {
    return this.started && !this.isOver;
  }

  get playerCount(): number {
    return this.#seats.length;
  }

  /** Why a new player could not take a seat right now, or `null` if they can. */
  joinError(): RoomErrorCode | null {
    if (this.started) return "ALREADY_STARTED";
    if (this.#seats.length >= this.#options.settings.maxPlayers) {
      return "ROOM_FULL";
    }
    return null;
  }

  /** Seat a new player. The first one to join is the host. */
  join(id: PlayerId, name: string, avatar: AvatarId): RoomErrorCode | null {
    const error = this.joinError();
    if (error !== null) return error;
    this.#seats.push({
      id,
      name: this.#uniqueName(name),
      avatar,
      isBot: false,
      connected: true,
      graceTimer: null,
      graceEndsAt: null,
    });
    this.#hostId ??= id;
    this.#changed();
    return null;
  }

  /**
   * A player is gone for good. Before the game, and once it is over, their seat
   * is freed. In between, a bot takes it over so everyone else can finish.
   */
  leave(id: PlayerId): void {
    const seat = this.#seat(id);
    if (seat === undefined || (seat.isBot && this.started)) return;
    this.#clearGrace(seat);
    if (this.started && !this.isOver) {
      seat.isBot = true;
      seat.connected = true;
    } else {
      this.#seats.splice(this.#seats.indexOf(seat), 1);
    }
    if (this.#hostId === id) {
      this.#hostId = this.#seats.find((s) => !s.isBot)?.id ?? null;
    }
    this.#changed();
    this.#scheduleBots();
  }

  /** A player lost their connection. Their seat is kept for now. */
  disconnect(id: PlayerId): void {
    const seat = this.#seat(id);
    if (seat === undefined || seat.isBot) return;
    seat.connected = false;
    this.#changed();
    this.#armGraceTimers();
  }

  /** A dropped player is back. Catch them up on where the game is. */
  reconnect(id: PlayerId): void {
    const seat = this.#seat(id);
    if (seat === undefined || seat.isBot) return;
    seat.connected = true;
    this.#clearGrace(seat);
    this.#changed();
    this.#sendGame(id, []);
  }

  /** Send the current lobby, and the game if it has started, to one player. */
  sync(id: PlayerId): void {
    this.#options.send(id, "lobby", this.snapshot());
    this.#sendGame(id, []);
  }

  /** The host starts the game, filling empty seats with bots if that is switched on. */
  start(id: PlayerId): void {
    if (this.started) return this.#fail(id, "ALREADY_STARTED");
    if (this.#hostId !== id) return this.#fail(id, "NOT_HOST");
    if (this.#seatsAfterFilling() < 2) {
      return this.#fail(id, "NOT_ENOUGH_PLAYERS");
    }
    this.#beginGame();
  }

  /** After a game, the host starts another with the same rules and the players who stayed. */
  playAgain(id: PlayerId): void {
    if (!this.started) return this.#fail(id, "NOT_STARTED");
    if (!this.isOver) return this.#fail(id, "NOT_GAME_OVER");
    if (this.#hostId !== id) return this.#fail(id, "NOT_HOST");
    if (this.#seatsAfterFilling() < 2) {
      return this.#fail(id, "NOT_ENOUGH_PLAYERS");
    }

    // Bots are filled in again below. Keep the people, host first, in table order.
    const people = this.#seats.filter((s) => !s.isBot);
    const hostAt = people.findIndex((s) => s.id === this.#hostId);
    this.#seats.splice(
      0,
      this.#seats.length,
      ...people.slice(hostAt),
      ...people.slice(0, hostAt),
    );
    this.#game = null;
    this.#beginGame();
  }

  /** A player asks to do something in the game. */
  act(id: PlayerId, action: Action): void {
    if (this.#game === null) return this.#fail(id, "NOT_STARTED");
    // The next hole also starts by itself, but only the host can do it early.
    if (action.type === "startNextHole" && id !== this.#hostId) {
      return this.#fail(id, "NOT_HOST");
    }
    this.#apply(id, action);
  }

  snapshot(): LobbySnapshot {
    return {
      code: this.#options.code,
      hostId: this.#hostId ?? "",
      settings: this.#options.settings,
      players: this.#seats.map((s): LobbyPlayer => ({
        id: s.id,
        name: s.name,
        avatar: s.avatar,
        isBot: s.isBot,
        connected: s.connected,
        reconnectDeadline: s.graceEndsAt,
      })),
      started: this.started,
      serverTime: Date.now(),
    };
  }

  /** Stop any pending bot move. Call when the room closes. */
  dispose(): void {
    this.#disposed = true;
    if (this.#botTimer !== null) clearTimeout(this.#botTimer);
    this.#botTimer = null;
    this.#clearNextHoleTimer();
    for (const seat of this.#seats) this.#clearGrace(seat);
  }

  // Internals

  #seat(id: PlayerId): Seat | undefined {
    return this.#seats.find((s) => s.id === id);
  }

  #fail(id: PlayerId, code: RoomErrorCode): void {
    this.#options.send(id, "error", { code });
  }

  /** How many seats there will be once bots fill the empty ones, if that is on. */
  #seatsAfterFilling(): number {
    const { settings } = this.#options;
    const people = this.#seats.filter((s) => !s.isBot).length;
    return settings.bots ? settings.maxPlayers : people;
  }

  /** Deal a new game to whoever is seated, adding bots first if that is on. */
  #beginGame(): void {
    const { settings } = this.#options;
    if (settings.bots) {
      this.#seats.splice(
        0,
        this.#seats.length,
        ...this.#seats.filter((s) => !s.isBot),
      );
      let botNumber = 1;
      while (this.#seats.length < settings.maxPlayers) {
        this.#seats.push({
          id: `bot-${botNumber}`,
          name: `Bot ${botNumber}`,
          avatar: this.#freeAvatar(),
          isBot: true,
          connected: true,
          graceTimer: null,
          graceEndsAt: null,
        });
        botNumber += 1;
      }
    }

    this.#result = null;
    this.#game = createGame(
      settings,
      this.#seats.map((s) => s.id),
      this.#options.rng,
    );
    this.#changed();
    this.#broadcastGame([]);
    this.#afterGameChange();
  }

  /** Everything that depends on where the game has got to. */
  #afterGameChange(): void {
    this.#scheduleBots();
    this.#scheduleNextHole();
    if (this.isOver) this.#releaseDroppedPlayers();
    else this.#armGraceTimers();
  }

  /** Whether the game is waiting for this player to do something. */
  #isWaitingOn(id: PlayerId): boolean {
    if (this.#game === null) return false;
    return getLegalActions(this.#game, id).some(
      (a) => a.type !== "startNextHole",
    );
  }

  /**
   * A dropped player gets a limited time to return, but the clock only starts
   * once the game is waiting for them. Until then everyone else carries on.
   */
  #armGraceTimers(): void {
    if (!this.started || this.isOver) return;
    const graceMs =
      this.#options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
    let armed = false;
    for (const seat of this.#seats) {
      if (seat.isBot || seat.connected || seat.graceTimer !== null) continue;
      if (!this.#isWaitingOn(seat.id)) continue;
      seat.graceEndsAt = Date.now() + graceMs;
      seat.graceTimer = setTimeout(() => this.#takeOver(seat.id), graceMs);
      armed = true;
    }
    if (armed) this.#changed();
  }

  #clearGrace(seat: Seat): void {
    if (seat.graceTimer !== null) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceEndsAt = null;
  }

  /** A dropped player ran out of time. A bot plays on in their seat. */
  #takeOver(id: PlayerId): void {
    const seat = this.#seat(id);
    if (seat === undefined || seat.connected) return;
    seat.graceTimer = null;
    this.leave(id);
    this.#options.onTakeover?.(id);
  }

  /** Nobody is needed any more once the game is over, so dropped players are let go. */
  #releaseDroppedPlayers(): void {
    for (const seat of [...this.#seats]) {
      if (seat.isBot || seat.connected) continue;
      this.leave(seat.id);
      this.#options.onTakeover?.(seat.id);
    }
  }

  #clearNextHoleTimer(): void {
    if (this.#nextHoleTimer !== null) clearTimeout(this.#nextHoleTimer);
    this.#nextHoleTimer = null;
    this.#nextHoleAt = null;
  }

  /** Between holes, start the next one by itself after a while. */
  #scheduleNextHole(): void {
    if (this.#disposed) return;
    if (this.#game?.phase.type !== "holeOver") {
      this.#clearNextHoleTimer();
      return;
    }
    if (this.#nextHoleTimer !== null) return;
    const delay = this.#options.nextHoleDelayMs ?? DEFAULT_NEXT_HOLE_DELAY_MS;
    this.#nextHoleAt = Date.now() + delay;
    this.#nextHoleTimer = setTimeout(() => {
      this.#nextHoleTimer = null;
      this.#nextHoleAt = null;
      const anyone = this.#seats[0]?.id;
      if (anyone !== undefined) this.#apply(anyone, { type: "startNextHole" });
    }, delay);
  }

  #changed(): void {
    const snapshot = this.snapshot();
    for (const seat of this.#seats) {
      if (!seat.isBot) this.#options.send(seat.id, "lobby", snapshot);
    }
    this.#options.onLobbyChange?.(snapshot);
  }

  /** "Sam", then "Sam 2", "Sam 3" if people pick the same name. */
  #uniqueName(name: string): string {
    const taken = new Set(this.#seats.map((s) => s.name.toLowerCase()));
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
      candidate = `${name} ${n}`;
    }
    return candidate;
  }

  /** An avatar nobody is using yet, if there is one. */
  #freeAvatar(): AvatarId {
    const used = new Set(this.#seats.map((s) => s.avatar));
    return (
      AVATAR_IDS.find((a) => !used.has(a)) ??
      (AVATAR_IDS[this.#seats.length % AVATAR_IDS.length] as AvatarId)
    );
  }

  #apply(id: PlayerId, action: Action): void {
    if (this.#game === null) return;
    const result = applyAction(this.#game, id, action, this.#options.rng);
    if (!result.ok) return this.#fail(id, result.error);
    this.#game = result.state;
    // Names and avatars are copied now, so the sheet stays complete after people leave.
    if (this.isOver) {
      this.#result ??= buildGameResult(
        this.#game.players,
        this.snapshot().players,
      );
    }
    this.#scheduleNextHole();
    this.#broadcastGame(result.events);
    this.#afterGameChange();
  }

  #sendGame(id: PlayerId, events: readonly GameEvent[]): void {
    if (this.#game === null) return;
    this.#options.send(id, "game", {
      view: getPlayerView(this.#game, id),
      events,
      serverTime: Date.now(),
      nextHoleAt: this.#nextHoleAt,
      result: this.isOver ? this.#result : null,
    });
  }

  #broadcastGame(events: readonly GameEvent[]): void {
    for (const seat of this.#seats) {
      if (!seat.isBot) this.#sendGame(seat.id, events);
    }
  }

  /** The first bot that has something to do, and what it wants to do. */
  #nextBotMove(): { id: PlayerId; action: Action } | null {
    if (this.#game === null) return null;
    for (const seat of this.#seats) {
      if (!seat.isBot) continue;
      const action = chooseAction(
        getPlayerView(this.#game, seat.id),
        this.#options.rng,
        this.#options.settings.botDifficulty,
      );
      if (action !== null) return { id: seat.id, action };
    }
    return null;
  }

  #scheduleBots(): void {
    if (this.#disposed || this.#botTimer !== null) return;
    if (this.#nextBotMove() === null) return;
    this.#botTimer = setTimeout(() => {
      this.#botTimer = null;
      // Look again: the game may have moved on while the bot was "thinking".
      const move = this.#nextBotMove();
      if (move !== null) this.#apply(move.id, move.action);
    }, this.#options.botDelayMs ?? DEFAULT_BOT_DELAY_MS);
  }
}
