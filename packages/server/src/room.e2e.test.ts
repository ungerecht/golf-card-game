import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "colyseus";
import {
  ROOM_NAME,
  type GameUpdate,
  type LobbySnapshot,
  type RoomError,
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

  constructor(readonly room: Room) {
    room.onMessage("lobby", (m: LobbySnapshot) => this.lobby.push(m));
    room.onMessage("game", (m: GameUpdate) => this.game.push(m));
    room.onMessage("error", (m: RoomError) => this.errors.push(m));
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
  check: () => boolean,
  what: string,
  ms = 3000,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

let server: Server;
let client: Client;

beforeAll(async () => {
  const port = await freePort();
  server = createGameServer({
    botDelayMs: 5,
    reconnectGraceMs: 1000,
    nextHoleDelayMs: 200,
  });
  await server.listen(port);
  client = new Client(`ws://localhost:${port}`);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function host(settings: Record<string, unknown> = {}): Promise<Player> {
  const room = await client.create(ROOM_NAME, {
    name: "Ann",
    avatar: "visor",
    settings,
  });
  const player = new Player(room);
  await until(() => player.lobby.length > 0, "the lobby");
  return player;
}

async function join(
  code: string,
  name: string,
  avatar = "teal",
): Promise<Player> {
  const room = await client.joinById(code, { name, avatar });
  const player = new Player(room);
  await until(() => player.lobby.length > 0, "the lobby");
  return player;
}

describe("creating and joining a room", () => {
  it("uses a readable lobby code as the room id", async () => {
    const ann = await host({ holes: 3 });
    expect(ann.room.roomId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(ann.latestLobby.code).toBe(ann.room.roomId);
    expect(ann.latestLobby.hostId).toBe(ann.id);
    expect(ann.latestLobby.settings).toMatchObject({
      holes: 3,
      maxPlayers: 4,
      botDifficulty: "normal",
    });
    await ann.room.leave();
  });

  it("lets friends join by code and shows everyone the roster", async () => {
    const ann = await host();
    const ben = await join(ann.room.roomId, "Ben");
    await until(() => ann.latestLobby.players.length === 2, "Ben to appear");

    expect(ben.latestLobby.players.map((p) => p.name)).toEqual(["Ann", "Ben"]);
    expect(ben.latestLobby.hostId).toBe(ann.id);
    await ben.room.leave();
    await until(() => ann.latestLobby.players.length === 1, "Ben to leave");
    await ann.room.leave();
  });

  it("rejects a bad name, a bad avatar and unknown codes", async () => {
    await expect(
      client.create(ROOM_NAME, { name: "", avatar: "visor" }),
    ).rejects.toBeDefined();
    await expect(
      client.create(ROOM_NAME, { name: "Ann", avatar: "dragon" }),
    ).rejects.toBeDefined();
    await expect(
      client.create(ROOM_NAME, {
        name: "Ann",
        avatar: "visor",
        settings: { holes: 4 },
      }),
    ).rejects.toBeDefined();
    await expect(
      client.joinById("ZZZZZ", { name: "Ben", avatar: "teal" }),
    ).rejects.toBeDefined();

    const ann = await host();
    await expect(
      client.joinById(ann.room.roomId, { name: "Ben", avatar: "nope" }),
    ).rejects.toBeDefined();
    await ann.room.leave();
  });

  it("refuses a join when the room is full", async () => {
    const ann = await host({ maxPlayers: 2 });
    const ben = await join(ann.room.roomId, "Ben");
    await expect(
      client.joinById(ann.room.roomId, { name: "Cy", avatar: "chip" }),
    ).rejects.toBeDefined();
    await ben.room.leave();
    await ann.room.leave();
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
    await expect(
      client.joinById(ann.room.roomId, { name: "Cy", avatar: "chip" }),
    ).rejects.toBeDefined();

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
