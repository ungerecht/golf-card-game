import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  chooseAction,
  type AvatarId,
  createSeededRng,
  type GameSettings,
  type GameUpdate,
  type LobbySnapshot,
  type RoomClosed,
  type RoomError,
  type RoomErrorCode,
  type ServerMessages,
  type ServerMessageType,
} from "@golf/shared";
import {
  DEFAULT_RECONNECT_GRACE_MS,
  GameSession,
  type SessionOptions,
} from "./gameSession";
import { normalizeLobbyCode } from "./codes";

interface Inbox {
  lobby: LobbySnapshot[];
  game: GameUpdate[];
  error: RoomError[];
  closed: RoomClosed[];
}

function setup(
  overrides: Partial<GameSettings> = {},
  seed = 1,
  extra: Partial<SessionOptions> = {},
) {
  const inboxes = new Map<string, Inbox>();
  const inbox = (id: string): Inbox => {
    let box = inboxes.get(id);
    if (box === undefined) {
      box = { lobby: [], game: [], error: [], closed: [] };
      inboxes.set(id, box);
    }
    return box;
  };
  const changes: LobbySnapshot[] = [];
  const session = new GameSession({
    code: "ABCDE",
    settings: { ...DEFAULT_SETTINGS, holes: 3, ...overrides },
    rng: createSeededRng(seed),
    botDelayMs: 10,
    send: <K extends ServerMessageType>(
      id: string,
      type: K,
      message: ServerMessages[K],
    ) => {
      (inbox(id)[type] as ServerMessages[K][]).push(message);
    },
    onLobbyChange: (snapshot) => changes.push(snapshot),
    ...extra,
  });
  return { session, inbox, changes };
}

/** Connect, then claim a seat, the way a client does. */
function join(
  session: GameSession,
  id: string,
  name: string,
  avatar: AvatarId,
): RoomErrorCode | null {
  const error = session.connect(id);
  if (error !== null) return error;
  session.ready(id, name, avatar);
  return null;
}

const last = <T>(items: readonly T[]): T => {
  const item = items.at(-1);
  if (item === undefined) throw new Error("nothing received");
  return item;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("room codes", () => {
  it("normalizes typed room codes the same way the client does", () => {
    expect(normalizeLobbyCode("ab c-d1")).toBe("ABCD");
    expect(normalizeLobbyCode("abcdefgh")).toBe("ABCDE");
  });
});

describe("the lobby", () => {
  it("makes the first player the host and seats everyone in join order", () => {
    const { session, inbox } = setup();
    expect(join(session, "a", "Ann", "visor")).toBeNull();
    expect(join(session, "b", "Ben", "teal")).toBeNull();

    const snapshot = last(inbox("b").lobby);
    expect(snapshot.code).toBe("ABCDE");
    expect(snapshot.hostId).toBe("a");
    expect(snapshot.players.map((p) => [p.id, p.name, p.avatar])).toEqual([
      ["a", "Ann", "visor"],
      ["b", "Ben", "teal"],
    ]);
    expect(snapshot.started).toBe(false);
  });

  it("tells everyone when someone joins", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    const before = inbox("a").lobby.length;
    join(session, "b", "Ben", "teal");
    // One update for connecting, one for taking a seat.
    expect(inbox("a").lobby.length).toBe(before + 2);
    expect(last(inbox("a").lobby).players).toHaveLength(2);
  });

  it("renames players who pick a name that is already taken", () => {
    const { session, inbox } = setup();
    join(session, "a", "Sam", "visor");
    join(session, "b", "sam", "teal");
    join(session, "c", "Sam", "chip");
    expect(last(inbox("c").lobby).players.map((p) => p.name)).toEqual([
      "Sam",
      "sam 2",
      "Sam 3",
    ]);
  });

  it("refuses players once the room is full", () => {
    const { session } = setup({ maxPlayers: 2 });
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    expect(session.joinError()).toBe("ROOM_FULL");
    expect(join(session, "c", "Cy", "chip")).toBe("ROOM_FULL");
    expect(session.playerCount).toBe(2);
  });

  it("frees the seat of a player who leaves, and passes on the host", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    join(session, "c", "Cy", "chip");
    session.leave("a");

    const snapshot = last(inbox("b").lobby);
    expect(snapshot.players.map((p) => p.id)).toEqual(["b", "c"]);
    expect(snapshot.hostId).toBe("b");
    expect(session.joinError()).toBeNull();
  });

  it("puts a new connection in the waiting room without a seat", () => {
    const { session, inbox } = setup();
    expect(session.connect("a")).toBeNull();
    const snapshot = last(inbox("a").lobby);
    expect(snapshot.hostId).toBe("a");
    expect(snapshot.players).toEqual([]);
    expect(session.playerCount).toBe(0);
  });

  it("always seats the host first, even if a guest readies up before them", () => {
    const { session, inbox } = setup();
    session.connect("host");
    session.connect("guest");
    session.ready("guest", "Gus", "teal");
    session.ready("host", "Hana", "visor");
    expect(last(inbox("guest").lobby).players.map((p) => p.id)).toEqual([
      "host",
      "guest",
    ]);
  });

  it("counts connections without a seat towards the room size", () => {
    const { session } = setup({ maxPlayers: 2 });
    session.connect("a");
    session.connect("b");
    expect(session.connect("c")).toBe("ROOM_FULL");
  });

  it("refuses an avatar someone else already has", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    session.connect("b");
    session.ready("b", "Ben", "visor");
    expect(last(inbox("b").error).code).toBe("AVATAR_TAKEN");
    expect(session.playerCount).toBe(1);
    session.ready("b", "Ben", "teal");
    expect(session.playerCount).toBe(2);
  });

  it("gives the avatar to whoever asks first when two pick at once", () => {
    const { session, inbox } = setup();
    session.connect("a");
    session.connect("b");
    session.ready("a", "Ann", "chip");
    session.ready("b", "Ben", "chip");
    expect(last(inbox("b").error).code).toBe("AVATAR_TAKEN");
    expect(last(inbox("a").lobby).players.map((p) => p.avatar)).toEqual([
      "chip",
    ]);
  });

  it("frees an avatar when its player leaves", () => {
    const { session } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    session.leave("b");
    expect(join(session, "c", "Cy", "teal")).toBeNull();
    expect(session.playerCount).toBe(2);
  });

  it("does not seat someone twice", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    session.ready("a", "Ann", "teal");
    expect(last(inbox("a").error).code).toBe("ALREADY_READY");
    expect(session.playerCount).toBe(1);
  });

  it("ignores ready from someone who never connected", () => {
    const { session, inbox } = setup();
    session.ready("ghost", "Boo", "visor");
    expect(last(inbox("ghost").error).code).toBe("NOT_READY");
    expect(session.playerCount).toBe(0);
  });

  it("drops a connection that has not readied up in time", () => {
    const kicked: string[] = [];
    const { session, inbox } = setup({}, 1, {
      readyTimeoutMs: 1000,
      onKick: (id) => kicked.push(id),
    });
    join(session, "a", "Ann", "visor");
    session.connect("b");
    vi.advanceTimersByTime(999);
    expect(kicked).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(kicked).toEqual(["b"]);
    expect(last(inbox("b").closed).reason).toBe("TIMED_OUT");
  });

  it("does not drop someone who pressed ready", () => {
    const kicked: string[] = [];
    const { session } = setup({}, 1, {
      readyTimeoutMs: 1000,
      onKick: (id) => kicked.push(id),
    });
    join(session, "a", "Ann", "visor");
    vi.advanceTimersByTime(5000);
    expect(kicked).toEqual([]);
  });

  it("frees the slot of a connection that leaves without a seat", () => {
    const { session } = setup({ maxPlayers: 2 });
    session.connect("a");
    session.connect("b");
    session.leave("b");
    expect(session.connect("c")).toBeNull();
  });

  it("will not start until the host has a seat", () => {
    const { session, inbox } = setup();
    session.connect("host");
    join(session, "b", "Ben", "teal");
    session.start("host");
    expect(last(inbox("host").error).code).toBe("NOT_READY");
    expect(session.started).toBe(false);
  });

  it("lets go of anyone still without a seat when the game starts", () => {
    const kicked: string[] = [];
    const { session, inbox } = setup({}, 1, {
      onKick: (id) => kicked.push(id),
    });
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    session.connect("late");
    session.start("a");
    expect(kicked).toEqual(["late"]);
    expect(last(inbox("late").closed).reason).toBe("GAME_STARTED");
  });

  it("keeps a waiting host who reconnects, and sends them the lobby again", () => {
    const { session, inbox } = setup();
    session.connect("host");
    const before = inbox("host").lobby.length;
    session.disconnect("host");
    session.reconnect("host");
    expect(inbox("host").lobby.length).toBeGreaterThan(before);
    expect(session.hostId).toBe("host");
  });

  it("reports every change for the room listing", () => {
    const { session, changes } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    expect(changes.map((c) => c.players.length)).toEqual([0, 1, 1, 2]);
  });
});

describe("starting the game", () => {
  it("lets only the host start, and needs two players", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    session.start("a");
    expect(last(inbox("a").error)).toEqual({ code: "NOT_ENOUGH_PLAYERS" });

    join(session, "b", "Ben", "teal");
    session.start("b");
    expect(last(inbox("b").error)).toEqual({ code: "NOT_HOST" });
    expect(session.started).toBe(false);

    session.start("a");
    expect(session.started).toBe(true);
    session.start("a");
    expect(last(inbox("a").error)).toEqual({ code: "ALREADY_STARTED" });
  });

  it("seats the host first so they deal the first hole", () => {
    const { session } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    session.start("a");
    expect(session.game?.players.map((p) => p.id)).toEqual(["a", "b"]);
    expect(session.game?.dealerIndex).toBe(0);
  });

  it("gives each player a view of their own seat, and nothing hidden", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    session.start("a");

    for (const id of ["a", "b"]) {
      const { view, events } = last(inbox(id).game);
      expect(view.viewerId).toBe(id);
      expect(events).toEqual([]);
      expect(view).not.toHaveProperty("deck");
      const json = JSON.stringify(view);
      for (const hidden of session.game?.deck ?? []) {
        expect(json).not.toContain(`"${hidden.id}"`);
      }
    }
  });

  it("refuses new players once the game has started", () => {
    const { session } = setup();
    join(session, "a", "Ann", "visor");
    join(session, "b", "Ben", "teal");
    session.start("a");
    expect(join(session, "c", "Cy", "chip")).toBe("ALREADY_STARTED");
  });

  it("fills empty seats with bots when the host switched them on", () => {
    const { session, inbox } = setup({ bots: true, maxPlayers: 4 });
    join(session, "a", "Ann", "visor");
    session.start("a");

    const players = last(inbox("a").lobby).players;
    expect(players.map((p) => p.isBot)).toEqual([false, true, true, true]);
    expect(players.map((p) => p.name)).toEqual([
      "Ann",
      "Bot 1",
      "Bot 2",
      "Bot 3",
    ]);
    expect(new Set(players.map((p) => p.avatar)).size).toBe(4);
    expect(session.game?.players).toHaveLength(4);
  });
});

describe("playing", () => {
  function twoPlayers() {
    const harness = setup();
    join(harness.session, "a", "Ann", "visor");
    join(harness.session, "b", "Ben", "teal");
    harness.session.start("a");
    return harness;
  }

  it("rejects actions before the game starts", () => {
    const { session, inbox } = setup();
    join(session, "a", "Ann", "visor");
    session.act("a", { type: "flipInitial", slot: 0 });
    expect(last(inbox("a").error)).toEqual({ code: "NOT_STARTED" });
  });

  it("applies a legal action and sends the events to everyone", () => {
    const { session, inbox } = twoPlayers();
    session.act("a", { type: "flipInitial", slot: 0 });

    for (const id of ["a", "b"]) {
      const { events, view } = last(inbox(id).game);
      expect(events).toMatchObject([
        { type: "flipped", playerId: "a", slot: 0 },
      ]);
      expect(view.players[0]?.grid[0]?.faceUp).toBe(true);
    }
  });

  it("tells only the sender when an action is illegal", () => {
    const { session, inbox } = twoPlayers();
    const gamesBefore = inbox("b").game.length;
    session.act("a", { type: "drawFromDeck" });
    expect(last(inbox("a").error)).toEqual({ code: "WRONG_PHASE" });
    expect(inbox("b").error).toEqual([]);
    expect(inbox("b").game.length).toBe(gamesBefore);
  });

  it("ignores actions from people who are not seated", () => {
    const { session, inbox } = twoPlayers();
    session.act("stranger", { type: "flipInitial", slot: 0 });
    expect(last(inbox("stranger").error)).toEqual({ code: "NOT_A_PLAYER" });
  });

  it("keeps a dropped player's seat, and catches them up when they return", () => {
    const { session, inbox } = twoPlayers();
    session.disconnect("b");
    expect(last(inbox("a").lobby).players[1]?.connected).toBe(false);

    session.act("a", { type: "flipInitial", slot: 0 });
    session.reconnect("b");
    expect(last(inbox("a").lobby).players[1]?.connected).toBe(true);
    const { view, events } = last(inbox("b").game);
    expect(events).toEqual([]);
    expect(view.players[0]?.grid[0]?.faceUp).toBe(true);
  });

  it("hands a seat to a bot when its player leaves, and the game carries on", () => {
    const { session, inbox } = twoPlayers();
    session.leave("b");

    const players = last(inbox("a").lobby).players;
    expect(players.map((p) => [p.id, p.isBot])).toEqual([
      ["a", false],
      ["b", true],
    ]);

    // The bot flips its two cards without any help.
    vi.advanceTimersByTime(100);
    const flipped = session.game?.players[1]?.grid.filter((g) => g.faceUp);
    expect(flipped).toHaveLength(2);
  });
});

describe("bots", () => {
  it("play their turns by themselves, one move at a time", () => {
    const { session } = setup({ bots: true, maxPlayers: 3 });
    join(session, "a", "Ann", "visor");
    session.start("a");

    const faceUp = () =>
      session.game?.players.map((p) => p.grid.filter((g) => g.faceUp).length);
    expect(faceUp()).toEqual([0, 0, 0]);
    vi.advanceTimersByTime(10);
    expect(faceUp()?.filter((n) => n > 0)).toHaveLength(1);
    vi.advanceTimersByTime(40);
    expect(faceUp()).toEqual([0, 2, 2]);
  });

  it("use the difficulty the host chose", () => {
    const run = (botDifficulty: "easy" | "normal") => {
      const { session } = setup({ bots: true, maxPlayers: 2, botDifficulty });
      join(session, "a", "Ann", "visor");
      session.start("a");
      vi.advanceTimersByTime(10_000);
      return session.game;
    };
    // Same seed, different strategy, so the games must differ.
    expect(run("easy")).not.toEqual(run("normal"));
  });

  it("play a whole game with one person, who is helped by a bot", () => {
    const { session, inbox } = setup({ bots: true, maxPlayers: 3 });
    join(session, "a", "Ann", "visor");
    session.start("a");

    // Ann plays like a bot would, and starts each hole when asked.
    const play = createSeededRng(7);
    for (
      let step = 0;
      step < 4000 && session.game?.phase.type !== "gameOver";
      step += 1
    ) {
      vi.advanceTimersByTime(10);
      const { view } = last(inbox("a").game);
      if (view.phase.type === "holeOver") {
        session.act("a", { type: "startNextHole" });
      } else {
        const action = chooseAction(view, play);
        if (action !== null) session.act("a", action);
      }
    }

    expect(session.game?.phase.type).toBe("gameOver");
    expect(session.game?.players.every((p) => p.holeScores.length === 3)).toBe(
      true,
    );
  });

  it("stop when the session is disposed", () => {
    const { session } = setup({ bots: true, maxPlayers: 2 });
    join(session, "a", "Ann", "visor");
    session.start("a");
    session.dispose();
    const before = JSON.stringify(session.game);
    vi.advanceTimersByTime(10_000);
    expect(JSON.stringify(session.game)).toBe(before);
  });
});

// Helpers for playing through a hole or a whole game as the people in it.

type Harness = ReturnType<typeof setup>;

/** Let `id` play like a bot would, until `done` is true. */
function autoplay(
  { session, inbox }: Harness,
  ids: string[],
  done: () => boolean,
  seed = 3,
): void {
  const rng = createSeededRng(seed);
  for (let step = 0; step < 5000 && !done(); step += 1) {
    vi.advanceTimersByTime(10);
    for (const id of ids) {
      const view = inbox(id).game.at(-1)?.view;
      if (view === undefined) continue;
      const action = chooseAction(view, rng);
      if (action !== null) session.act(id, action);
    }
  }
  if (!done()) throw new Error("never got there");
}

const phase = (h: Harness) => h.session.game?.phase.type;

/** Two people and no bots, with the initial flip done, so it is somebody's turn. */
function twoPeopleMidGame(extra: Partial<SessionOptions> = {}) {
  const h = setup({ holes: 3 }, 1, { botDelayMs: 10, ...extra });
  join(h.session, "a", "Ann", "visor");
  join(h.session, "b", "Ben", "teal");
  h.session.start("a");
  for (const id of ["a", "b"]) {
    h.session.act(id, { type: "flipInitial", slot: 0 });
    h.session.act(id, { type: "flipInitial", slot: 1 });
  }
  const current =
    h.session.game?.players[h.session.game.currentPlayerIndex]?.id;
  const other = current === "a" ? "b" : "a";
  return { h, current: current as string, other };
}

describe("a dropped player's reconnect clock", () => {
  const GRACE = 120_000;

  it("does not start until it is their turn", () => {
    const takeovers: string[] = [];
    const { h, current, other } = twoPeopleMidGame({
      reconnectGraceMs: GRACE,
      onTakeover: (id) => takeovers.push(id),
    });
    h.session.disconnect(other);

    // It is somebody else's turn, so there is nothing to wait for yet.
    vi.advanceTimersByTime(10 * GRACE);
    const dropped = last(h.inbox(current).lobby).players.find(
      (p) => p.id === other,
    );
    expect(dropped).toMatchObject({
      connected: false,
      reconnectDeadline: null,
      isBot: false,
    });
    expect(takeovers).toEqual([]);

    // The turn comes round to the dropped player, and the two minutes begin.
    h.session.act(current, { type: "flip", slot: 2 });
    const started = last(h.inbox(current).lobby);
    const now = started.serverTime;
    expect(started.players.find((p) => p.id === other)?.reconnectDeadline).toBe(
      now + GRACE,
    );

    vi.advanceTimersByTime(GRACE - 1);
    expect(takeovers).toEqual([]);
    expect(
      last(h.inbox(current).lobby).players.find((p) => p.id === other)?.isBot,
    ).toBe(false);

    vi.advanceTimersByTime(1);
    expect(takeovers).toEqual([other]);
    const after = last(h.inbox(current).lobby).players.find(
      (p) => p.id === other,
    );
    expect(after).toMatchObject({ isBot: true, reconnectDeadline: null });
  });

  it("starts straight away when it is already their turn", () => {
    const { h, current } = twoPeopleMidGame({ reconnectGraceMs: GRACE });
    const other = current === "a" ? "b" : "a";
    h.session.act(current, { type: "flip", slot: 2 }); // now it is other's turn
    h.session.disconnect(other);
    expect(
      last(h.inbox(current).lobby).players.find((p) => p.id === other)
        ?.reconnectDeadline,
    ).not.toBeNull();
  });

  it("starts at once for a player who still has initial flips to make", () => {
    const h = setup({ holes: 3 }, 1, { reconnectGraceMs: GRACE });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    h.session.disconnect("b");
    expect(
      last(h.inbox("a").lobby).players[1]?.reconnectDeadline,
    ).not.toBeNull();
  });

  it("is two minutes unless the room is configured otherwise", () => {
    const h = setup({ holes: 3 }, 1);
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    h.session.disconnect("b");
    const lobby = last(h.inbox("a").lobby);
    expect(lobby.players[1]?.reconnectDeadline).toBe(
      lobby.serverTime + 120_000,
    );
    expect(DEFAULT_RECONNECT_GRACE_MS).toBe(120_000);
  });

  it("is cancelled when the player comes back in time", () => {
    const takeovers: string[] = [];
    const { h, current, other } = twoPeopleMidGame({
      reconnectGraceMs: GRACE,
      onTakeover: (id) => takeovers.push(id),
    });
    h.session.disconnect(other);
    h.session.act(current, { type: "flip", slot: 2 });
    vi.advanceTimersByTime(GRACE - 1000);
    h.session.reconnect(other);

    vi.advanceTimersByTime(10 * GRACE);
    expect(takeovers).toEqual([]);
    expect(
      last(h.inbox(current).lobby).players.find((p) => p.id === other),
    ).toMatchObject({ isBot: false, connected: true, reconnectDeadline: null });
  });

  it("lets the bot that took over carry on playing the seat", () => {
    const { h, current, other } = twoPeopleMidGame({ reconnectGraceMs: GRACE });
    h.session.disconnect(other);
    h.session.act(current, { type: "flip", slot: 2 });
    vi.advanceTimersByTime(GRACE + 100);
    // The bot has taken its turn, so it is back to the person who stayed.
    const game = h.session.game;
    expect(game?.players[game.currentPlayerIndex]?.id).toBe(current);
    expect(game?.phase.type).toBe("flipOrDraw");
  });

  it("is not used in the lobby, where a dropped player just loses their seat", () => {
    const h = setup();
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    expect(h.session.holdsSeatsOnDrop).toBe(false);
    h.session.start("a");
    expect(h.session.holdsSeatsOnDrop).toBe(true);
  });
});

describe("between holes", () => {
  function atHoleOver(extra: Partial<SessionOptions> = {}) {
    const h = setup({ holes: 3, bots: true, maxPlayers: 2 }, 5, {
      botDelayMs: 1,
      ...extra,
    });
    join(h.session, "a", "Ann", "visor");
    h.session.start("a");
    autoplay(h, ["a"], () => phase(h) === "holeOver");
    return h;
  }

  it("only the host can start the next hole by hand", () => {
    const h = setup({ holes: 3 }, 5, {
      botDelayMs: 1,
      nextHoleDelayMs: 30_000,
    });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    autoplay(h, ["a", "b"], () => phase(h) === "holeOver");

    h.session.act("b", { type: "startNextHole" });
    expect(last(h.inbox("b").error)).toEqual({ code: "NOT_HOST" });
    expect(phase(h)).toBe("holeOver");

    h.session.act("a", { type: "startNextHole" });
    expect(h.session.game?.hole).toBe(2);
    expect(phase(h)).toBe("initialFlip");
  });

  it("starts by itself after 30 seconds, and says when", () => {
    const h = atHoleOver();
    const update = last(h.inbox("a").game);
    expect(update.view.phase.type).toBe("holeOver");
    expect(update.nextHoleAt).toBe(update.serverTime + 30_000);

    vi.advanceTimersByTime(29_999);
    expect(phase(h)).toBe("holeOver");
    vi.advanceTimersByTime(1);
    expect(h.session.game?.hole).toBe(2);
    expect(last(h.inbox("a").game).nextHoleAt).toBeNull();
  });

  it("does not start a second time after the host already did", () => {
    const h = atHoleOver();
    h.session.act("a", { type: "startNextHole" });
    expect(h.session.game?.hole).toBe(2);
    // Hole 2 is still being flipped. A leftover timer would deal hole 3 or error.
    vi.advanceTimersByTime(30_000);
    expect(h.session.game?.hole).toBeLessThanOrEqual(2);
  });

  it("does not run a countdown outside the gap between holes", () => {
    const h = setup({ holes: 3 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    expect(last(h.inbox("a").game).nextHoleAt).toBeNull();
  });
});

describe("the end of the game", () => {
  function atGameOver(extra: Partial<GameSettings> = {}) {
    const h = setup({ holes: 3, bots: true, maxPlayers: 3, ...extra }, 11, {
      botDelayMs: 1,
      nextHoleDelayMs: 50,
    });
    join(h.session, "a", "Ann", "visor");
    h.session.start("a");
    autoplay(h, ["a"], () => phase(h) === "gameOver");
    return h;
  }

  it("sends the final scoresheet and the winners with their names and avatars", () => {
    const h = atGameOver();
    const { result } = last(h.inbox("a").game);
    if (result === null) throw new Error("no result");

    expect(result.scoresheet).toHaveLength(3);
    const totals = result.scoresheet.map((r) => r.total);
    expect(totals).toEqual([...totals].sort((x, y) => x - y));
    for (const row of result.scoresheet) {
      expect(row.holeScores).toHaveLength(3);
      expect(row.total).toBe(row.holeScores.reduce((x, y) => x + y, 0));
    }
    expect(result.scoresheet[0]?.rank).toBe(1);
    expect(result.winners.length).toBeGreaterThan(0);
    for (const winner of result.winners) {
      const seat = last(h.inbox("a").lobby).players.find(
        (p) => p.id === winner.playerId,
      );
      expect(winner).toMatchObject({
        name: seat?.name,
        avatar: seat?.avatar,
        winner: true,
      });
      expect(winner.total).toBe(totals[0]);
    }
  });

  it("only has a result once the game is over", () => {
    const h = setup({ holes: 3 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    expect(last(h.inbox("a").game).result).toBeNull();
  });

  it("lets the host start another game with the same rules and players", () => {
    const h = atGameOver();
    const settings = last(h.inbox("a").lobby).settings;

    h.session.playAgain("a");
    const game = h.session.game;
    expect(game?.hole).toBe(1);
    expect(game?.phase.type).toBe("initialFlip");
    expect(game?.settings).toEqual(settings);
    expect(game?.players.map((p) => p.id)).toEqual(["a", "bot-1", "bot-2"]);
    expect(game?.players.every((p) => p.holeScores.length === 0)).toBe(true);
    expect(last(h.inbox("a").game).result).toBeNull();
  });

  it("only lets the host do it, and only once the game is over", () => {
    const h = setup({ holes: 3 }, 1);
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.playAgain("a");
    expect(last(h.inbox("a").error)).toEqual({ code: "NOT_STARTED" });
    h.session.start("a");
    h.session.playAgain("a");
    expect(last(h.inbox("a").error)).toEqual({ code: "NOT_GAME_OVER" });

    const done = atGameOver();
    join(done.session, "b", "Ben", "teal");
    done.session.playAgain("b");
    expect(done.session.isOver).toBe(true);
  });

  it("lets each player leave, which frees their seat for good", () => {
    const h = setup({ holes: 3 }, 2, { botDelayMs: 1, nextHoleDelayMs: 50 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    join(h.session, "c", "Cy", "chip");
    h.session.start("a");
    autoplay(h, ["a", "b", "c"], () => phase(h) === "gameOver");

    h.session.leave("c");
    const players = last(h.inbox("a").lobby).players;
    expect(players.map((p) => p.id)).toEqual(["a", "b"]);

    h.session.playAgain("a");
    expect(h.session.game?.players.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("keeps a player who left on the scoresheet, with their name and avatar", () => {
    const h = setup({ holes: 3 }, 2, { botDelayMs: 1, nextHoleDelayMs: 50 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    join(h.session, "c", "Cy", "chip");
    h.session.start("a");
    autoplay(h, ["a", "b", "c"], () => phase(h) === "gameOver");

    const before = last(h.inbox("a").game).result;
    h.session.leave("c");
    h.session.sync("a");
    const after = last(h.inbox("a").game).result;

    expect(after).toEqual(before);
    expect(after?.scoresheet.map((r) => [r.name, r.avatar]).sort()).toEqual([
      ["Ann", "visor"],
      ["Ben", "teal"],
      ["Cy", "chip"],
    ]);
  });

  it("passes the host role on when the host leaves, and puts the new host first", () => {
    const h = setup({ holes: 3 }, 2, { botDelayMs: 1, nextHoleDelayMs: 50 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    join(h.session, "c", "Cy", "chip");
    h.session.start("a");
    autoplay(h, ["a", "b", "c"], () => phase(h) === "gameOver");

    h.session.leave("a");
    expect(last(h.inbox("b").lobby).hostId).toBe("b");
    h.session.playAgain("a");
    expect(last(h.inbox("a").error)).toEqual({ code: "NOT_HOST" });
    h.session.playAgain("b");
    expect(h.session.game?.players.map((p) => p.id)).toEqual(["b", "c"]);
    expect(h.session.game?.dealerIndex).toBe(0);
  });

  it("refuses to start again with too few players, and changes nothing", () => {
    const h = setup({ holes: 3 }, 2, { botDelayMs: 1, nextHoleDelayMs: 50 });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    autoplay(h, ["a", "b"], () => phase(h) === "gameOver");

    h.session.leave("b");
    h.session.playAgain("a");
    expect(last(h.inbox("a").error)).toEqual({ code: "NOT_ENOUGH_PLAYERS" });
    expect(h.session.isOver).toBe(true);
    expect(last(h.inbox("a").lobby).players.map((p) => p.id)).toEqual(["a"]);
  });

  it("refills bots when a person left, if bots are on", () => {
    const h = setup({ holes: 3, bots: true, maxPlayers: 3 }, 2, {
      botDelayMs: 1,
      nextHoleDelayMs: 50,
    });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");
    autoplay(h, ["a", "b"], () => phase(h) === "gameOver");
    h.session.leave("b");
    h.session.playAgain("a");
    expect(h.session.game?.players.map((p) => p.id)).toEqual([
      "a",
      "bot-1",
      "bot-2",
    ]);
  });

  it("lets go of players who were still dropped when the game ended", () => {
    const takeovers: string[] = [];
    const h = setup({ holes: 3 }, 2, {
      botDelayMs: 1,
      nextHoleDelayMs: 50,
      reconnectGraceMs: 10 * 60 * 1000,
      onTakeover: (id) => takeovers.push(id),
    });
    join(h.session, "a", "Ann", "visor");
    join(h.session, "b", "Ben", "teal");
    h.session.start("a");

    // In the last hole, whoever goes out drops. Nobody needs them any more,
    // so they cannot hold up the end of the game.
    let dropped: string | null = null;
    autoplay(h, ["a", "b"], () => {
      const game = h.session.game;
      if (
        dropped === null &&
        game?.hole === 3 &&
        game.finalTurnTriggeredBy !== null
      ) {
        dropped = game.finalTurnTriggeredBy;
        h.session.disconnect(dropped);
      }
      return phase(h) === "gameOver";
    });

    expect(dropped).not.toBeNull();
    expect(takeovers).toEqual([dropped]);
    expect(
      last(h.inbox(dropped === "a" ? "b" : "a").lobby).players.map((p) => p.id),
    ).toEqual([dropped === "a" ? "b" : "a"]);
  });
});
