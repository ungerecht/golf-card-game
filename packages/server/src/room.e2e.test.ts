import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "colyseus";
import {
  ROOM_NAME,
  type ChatMessage,
  type GameUpdate,
  type LobbySnapshot,
  type RoomClosed,
  type RoomError,
  type RoomStatusResponse,
} from "@golf/shared";
import { createGameServer } from "./server";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** A client in a room, remembering everything the server sent. */
class Player {
  lobby: LobbySnapshot[] = [];
  game: GameUpdate[] = [];
  errors: RoomError[] = [];
  closed: RoomClosed[] = [];
  chat: ChatMessage[] = [];
  chatHistory: ChatMessage[][] = [];

  constructor(readonly room: Room) {
    room.onMessage("lobby", (m: LobbySnapshot) => this.lobby.push(m));
    room.onMessage("game", (m: GameUpdate) => this.game.push(m));
    room.onMessage("error", (m: RoomError) => this.errors.push(m));
    room.onMessage("closed", (m: RoomClosed) => this.closed.push(m));
    room.onMessage("chat", (m: ChatMessage) => this.chat.push(m));
    room.onMessage("chatHistory", (m: { messages: ChatMessage[] }) =>
      this.chatHistory.push(m.messages),
    );
  }

  /** Claim a seat, and wait until the server has shown us in the roster. */
  async ready(name: string, avatar = "visor"): Promise<this> {
    this.room.send("ready", { name, avatar });
    await until(
      () => this.lobby.at(-1)?.players.some((p) => p.id === this.id) ?? false,
      `${name} to get a seat`,
    );
    return this;
  }

  get id(): string {
    return this.room.sessionId;
  }
  get latestLobby(): LobbySnapshot {
    const snapshot = this.lobby.at(-1);
    if (snapshot === undefined) throw new Error("no lobby yet");
    return snapshot;
  }
  get latestGame(): GameUpdate {
    const update = this.game.at(-1);
    if (update === undefined) throw new Error("no game yet");
    return update;
  }
}

async function until(
  check: () => boolean | Promise<boolean>,
  what: string,
  ms = 3000,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

let server: Server;
let client: Client;
let baseUrl: string;

beforeAll(async () => {
  const port = await freePort();
  server = createGameServer({
    botDelayMs: 5,
    reconnectGraceMs: 1000,
    nextHoleDelayMs: 200,
    readyTimeoutMs: 1000,
    hostReconnectMs: 400,
  });
  await server.listen(port);
  baseUrl = `http://localhost:${port}`;
  client = new Client(`ws://localhost:${port}`);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** Connect to a new room. The player is in the waiting room but has no seat. */
async function connectHost(
  settings: Record<string, unknown> = {},
): Promise<Player> {
  const room = await client.create(ROOM_NAME, { settings });
  const player = new Player(room);
  await until(() => player.lobby.length > 0, "the lobby");
  return player;
}

/** Create a room and take the first seat. */
async function host(settings: Record<string, unknown> = {}): Promise<Player> {
  return (await connectHost(settings)).ready("Ann", "visor");
}

async function connect(code: string): Promise<Player> {
  const room = await client.joinById(code);
  const player = new Player(room);
  await until(() => player.lobby.length > 0, "the lobby");
  return player;
}

async function join(
  code: string,
  name: string,
  avatar = "teal",
): Promise<Player> {
  return (await connect(code)).ready(name, avatar);
}

async function status(code: string): Promise<RoomStatusResponse> {
  const response = await fetch(`${baseUrl}/rooms/${code}`);
  return (await response.json()) as RoomStatusResponse;
}

describe("creating and joining a room", () => {
  it("uses a readable lobby code as the room id", async () => {
    const ann = await connectHost({ holes: 3 });
    expect(ann.room.roomId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(ann.latestLobby.code).toBe(ann.room.roomId);
    expect(ann.latestLobby.hostId).toBe(ann.id);
    expect(ann.latestLobby.settings).toMatchObject({
      holes: 3,
      maxPlayers: 4,
      botDifficulty: "normal",
    });
    // Connecting is not enough to get a seat.
    expect(ann.latestLobby.players).toEqual([]);
    await ann.room.leave();
  });

  it("seats people when they press ready, host first", async () => {
    const ann = await connectHost();
    const ben = await connect(ann.room.roomId);
    await ben.ready("Ben", "teal");
    await ann.ready("Ann", "visor");

    await until(() => ben.latestLobby.players.length === 2, "both seats");
    expect(ben.latestLobby.players.map((p) => p.name)).toEqual(["Ann", "Ben"]);
    expect(ben.latestLobby.hostId).toBe(ann.id);
    await ben.room.leave();
    await until(() => ann.latestLobby.players.length === 1, "Ben to leave");
    await ann.room.leave();
  });

  it("rejects bad settings and unknown codes", async () => {
    await expect(
      client.create(ROOM_NAME, { settings: { holes: 4 } }),
    ).rejects.toBeDefined();
    await expect(client.joinById("ZZZZZ")).rejects.toBeDefined();
  });

  it("answers a bad name or avatar with an error and no seat", async () => {
    const ann = await connectHost();
    ann.room.send("ready", { name: "", avatar: "visor" });
    ann.room.send("ready", { name: "Ann", avatar: "dragon" });
    await until(() => ann.errors.length === 2, "two errors");
    expect(ann.errors.map((e) => e.code)).toEqual([
      "BAD_MESSAGE",
      "BAD_MESSAGE",
    ]);
    expect(ann.latestLobby.players).toEqual([]);
    await ann.room.leave();
  });

  it("refuses an avatar that is taken", async () => {
    const ann = await host();
    const ben = await connect(ann.room.roomId);
    ben.room.send("ready", { name: "Ben", avatar: "visor" });
    await until(() => ben.errors.length > 0, "an error for Ben");
    expect(ben.errors.at(-1)).toEqual({ code: "AVATAR_TAKEN" });
    await ben.ready("Ben", "teal");
    await ben.room.leave();
    await ann.room.leave();
  });

  it("refuses a connection when the room is full", async () => {
    const ann = await host({ maxPlayers: 2 });
    const ben = await join(ann.room.roomId, "Ben");
    await expect(client.joinById(ann.room.roomId)).rejects.toBeDefined();
    await ben.room.leave();
    await ann.room.leave();
  });
});

describe("the waiting room", () => {
  it("closes the room when the host leaves", async () => {
    const ann = await host();
    const ben = await join(ann.room.roomId, "Ben");
    const code = ann.room.roomId;
    await ann.room.leave();
    await until(() => ben.closed.length > 0, "the room to close");
    expect(ben.closed.at(-1)).toEqual({ reason: "HOST_LEFT" });
    await expect(client.joinById(code)).rejects.toBeDefined();
  });

  it("keeps the room when a guest leaves", async () => {
    const ann = await host();
    const ben = await join(ann.room.roomId, "Ben");
    await ben.room.leave();
    await until(() => ann.latestLobby.players.length === 1, "Ben to go");
    expect(ann.closed).toEqual([]);
    expect((await status(ann.room.roomId)).status).toBe("open");
    await ann.room.leave();
  });

  it("lets a host who refreshes come back in time", async () => {
    const ann = await host();
    const token = ann.room.reconnectionToken;
    ann.room.connection.close(4002);
    const back = new Player(await client.reconnect(token));
    await until(() => back.lobby.length > 0, "the lobby after reconnecting");
    expect(back.latestLobby.hostId).toBe(ann.id);
    expect(back.latestLobby.players.map((p) => p.name)).toEqual(["Ann"]);
    expect((await status(back.room.roomId)).status).toBe("open");
    await back.room.leave();
  });

  it("closes the room if the host does not come back in time", async () => {
    const ann = await host();
    const ben = await join(ann.room.roomId, "Ben");
    ann.room.connection.close(4002);
    await until(() => ben.closed.length > 0, "the room to close", 3000);
    expect(ben.closed.at(-1)).toEqual({ reason: "HOST_LEFT" });
  });

  it("drops someone who never presses ready", async () => {
    const ann = await host();
    const idle = await connect(ann.room.roomId);
    await until(() => idle.closed.length > 0, "the idle kick", 3000);
    expect(idle.closed.at(-1)).toEqual({ reason: "TIMED_OUT" });
    await until(
      async () => (await status(ann.room.roomId)).status === "open",
      "room to be open",
    );
    expect(ann.closed).toEqual([]);
    await ann.room.leave();
  });
});

describe("GET /rooms/:code", () => {
  it("says whether a code can be joined", async () => {
    expect((await status("ZZZZZ")).status).toBe("missing");

    const ann = await host({ maxPlayers: 2, holes: 3 });
    const code = ann.room.roomId;
    expect((await status(code)).status).toBe("open");
    // Lower case is fine, codes get typed by hand.
    expect((await status(code.toLowerCase())).status).toBe("open");

    const ben = await join(code, "Ben");
    expect((await status(code)).status).toBe("full");

    ann.room.send("start");
    await until(() => ben.game.length > 0, "the game to start");
    expect((await status(code)).status).toBe("started");
    await ben.room.leave();
    await ann.room.leave();
  });

  it("can be called from the browser app on another origin", async () => {
    const response = await fetch(`${baseUrl}/rooms/ZZZZZ`, {
      headers: { origin: "http://localhost:5173" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});

describe("playing a game", () => {
  it("starts on the host's say so, and sends each player only their own view", async () => {
    const ann = await host({ holes: 3 });
    const ben = await join(ann.room.roomId, "Ben");
    await until(() => ann.latestLobby.players.length === 2, "Ben to appear");

    ben.room.send("start");
    await until(() => ben.errors.length > 0, "an error for Ben");
    expect(ben.errors.at(-1)).toEqual({ code: "NOT_HOST" });

    ann.room.send("start");
    await until(
      () => ann.game.length > 0 && ben.game.length > 0,
      "the first views",
    );
    expect(ann.latestLobby.started).toBe(true);
    expect(ann.latestGame.view.viewerId).toBe(ann.id);
    expect(ben.latestGame.view.viewerId).toBe(ben.id);
    expect(ann.latestGame.view.phase.type).toBe("initialFlip");

    // No more joiners once it has started.
    await expect(client.joinById(ann.room.roomId)).rejects.toBeDefined();

    ann.room.send("action", { type: "flipInitial", slot: 2 });
    await until(
      () => ben.latestGame.events.some((e) => e.type === "flipped"),
      "Ben to see the flip",
    );
    expect(ben.latestGame.view.players[0]?.grid[2]?.faceUp).toBe(true);

    ann.room.send("action", { type: "nonsense" });
    await until(() => ann.errors.length > 0, "a bad message error");
    expect(ann.errors.at(-1)).toEqual({ code: "BAD_MESSAGE" });

    await ben.room.leave();
    await ann.room.leave();
  });

  it("plays out a game against bots", async () => {
    const ann = await host({
      holes: 3,
      maxPlayers: 3,
      bots: true,
      botDifficulty: "easy",
    });
    ann.room.send("start");
    await until(() => ann.game.length > 0, "the game to start");
    expect(ann.latestLobby.players.map((p) => p.isBot)).toEqual([
      false,
      true,
      true,
    ]);

    // Ann takes any legal action, as fast as the room's message limit allows. The bots do the rest.
    let acted = 0;
    let sawCountdown = false;
    const deadline = Date.now() + 20_000;
    while (ann.latestGame.view.phase.type !== "gameOver") {
      if (Date.now() > deadline) throw new Error("game did not finish");
      const { view } = ann.latestGame;
      // Ann never starts a hole herself, so the room has to do it after its delay.
      const action = view.legalActions.find((a) => a.type !== "startNextHole");
      if (view.phase.type === "holeOver")
        sawCountdown ||= ann.latestGame.nextHoleAt !== null;
      if (action !== undefined && acted < 5000) {
        const before = ann.game.length;
        ann.room.send("action", action);
        acted += 1;
        await new Promise((r) => setTimeout(r, 60));
        await until(
          () => ann.game.length > before || ann.errors.length > 0,
          "a reply",
        );
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    expect(
      ann.latestGame.view.players.every((p) => p.holeScores.length === 3),
    ).toBe(true);
    expect(sawCountdown).toBe(true);

    // The final scoresheet and winners come with the last update.
    const { result } = ann.latestGame;
    expect(result?.scoresheet).toHaveLength(3);
    expect(result?.winners.length).toBeGreaterThan(0);
    for (const winner of result?.winners ?? []) {
      const seat = ann.latestLobby.players.find(
        (p) => p.id === winner.playerId,
      );
      expect(winner).toMatchObject({ name: seat?.name, avatar: seat?.avatar });
    }

    // The host can play again with the same rules.
    const updates = ann.game.length;
    ann.room.send("playAgain");
    await until(() => ann.game.length > updates, "the new game");
    expect(ann.latestGame.result).toBeNull();
    expect(ann.latestGame.view.hole).toBe(1);
    expect(ann.latestGame.view.phase.type).toBe("initialFlip");
    expect(ann.latestLobby.players.map((p) => p.isBot)).toEqual([
      false,
      true,
      true,
    ]);
    await ann.room.leave();
  });

  it("only lets the host play again", async () => {
    const ann = await host({ holes: 3, bots: true, maxPlayers: 2 });
    const ben = await join(ann.room.roomId, "Ben");
    ben.room.send("playAgain");
    await until(() => ben.errors.length > 0, "an error for Ben");
    expect(ben.errors.at(-1)).toEqual({ code: "NOT_STARTED" });
    ann.room.send("start");
    await until(() => ben.game.length > 0, "the game to start");
    ben.room.send("playAgain");
    await until(() => ben.errors.length > 1, "a second error for Ben");
    expect(ben.errors.at(-1)).toEqual({ code: "NOT_GAME_OVER" });
    await ben.room.leave();
    await ann.room.leave();
  });

  it("gives a bot the seat of a player who does not come back in time", async () => {
    const ann = await host({ holes: 3 });
    const ben = await join(ann.room.roomId, "Ben");
    await until(() => ann.latestLobby.players.length === 2, "Ben to appear");
    ann.room.send("start");
    await until(() => ben.game.length > 0, "the game to start");

    // Everyone is flipping cards, so the game is already waiting on Ben.
    ben.room.connection.close(4002);
    await until(
      () => ann.latestLobby.players[1]?.reconnectDeadline != null,
      "the reconnect clock to start",
    );
    const deadline = ann.latestLobby.players[1]?.reconnectDeadline ?? 0;
    expect(deadline - ann.latestLobby.serverTime).toBeGreaterThan(0);
    expect(deadline - ann.latestLobby.serverTime).toBeLessThanOrEqual(1000);

    await until(
      () => ann.latestLobby.players[1]?.isBot === true,
      "a bot to take Ben's seat",
      3000,
    );
    await until(
      () =>
        ann.latestGame.view.players[1]?.grid.filter((s) => s.faceUp).length ===
        2,
      "the bot to flip Ben's cards",
    );
    await ann.room.leave();
  });

  it("lets a dropped player reconnect to the same seat", async () => {
    const ann = await host({ holes: 3 });
    const ben = await join(ann.room.roomId, "Ben");
    await until(() => ann.latestLobby.players.length === 2, "Ben to appear");
    ann.room.send("start");
    await until(() => ben.game.length > 0, "the game to start");

    const token = ben.room.reconnectionToken;
    ben.room.connection.close(4002);
    await until(
      () => ann.latestLobby.players[1]?.connected === false,
      "Ben to show as dropped",
    );

    const back = new Player(await client.reconnect(token));
    await until(() => back.game.length > 0, "Ben's view after reconnecting");
    expect(back.id).toBe(ben.id);
    expect(back.latestGame.view.viewerId).toBe(ben.id);
    await until(
      () => ann.latestLobby.players[1]?.connected === true,
      "Ben to show as back",
    );

    await back.room.leave();
    await ann.room.leave();
  });
});

describe("room chat", () => {
  it("carries messages between players and trims them", async () => {
    const ann = await host({ maxPlayers: 3 });
    const ben = await join(ann.room.roomId, "Ben");
    ann.room.send("chat", { text: "  hi Ben  " });
    await until(() => ben.chat.length === 1, "Ben to hear Ann");
    expect(ben.chat[0]).toMatchObject({ name: "Ann", text: "hi Ben" });
    expect(ann.chat).toHaveLength(1);

    const cy = await join(ann.room.roomId, "Cy", "lavender");
    await until(() => cy.chatHistory.length > 0, "Cy to get the history");
    expect(cy.chatHistory.at(-1)?.map((m) => m.text)).toEqual(["hi Ben"]);
    for (const p of [ben, cy, ann]) await p.room.leave();
  });

  it("refuses empty, long and multi-line messages", async () => {
    const ann = await host();
    await join(ann.room.roomId, "Ben");
    for (const text of ["   ", "x".repeat(201), "two\nlines", 42, undefined]) {
      ann.room.send("chat", { text });
    }
    ann.room.send("chat", "not an object");
    await until(() => ann.errors.length === 6, "six refusals");
    expect(ann.errors.every((e) => e.code === "BAD_MESSAGE")).toBe(true);
    expect(ann.chat).toHaveLength(0);
    await ann.room.leave();
  });

  it("does not let someone without a seat speak", async () => {
    const ann = await host();
    const lurker = await connect(ann.room.roomId);
    lurker.room.send("chat", { text: "hello?" });
    await until(() => lurker.errors.length === 1, "a refusal");
    expect(lurker.errors[0]?.code).toBe("NOT_READY");
    expect(ann.chat).toHaveLength(0);
    await lurker.room.leave();
    await ann.room.leave();
  });
});
