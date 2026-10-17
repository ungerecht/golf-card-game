import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@golf/shared";
import { FakeConnector, lobby, player } from "../test/fakes";
import { loadSession } from "../net/storage";
import { createLobbyStore } from "./lobbyStore";

let connector: FakeConnector;
beforeEach(() => {
  connector = new FakeConnector();
});

describe("hosting", () => {
  it("creates a room with the chosen settings and remembers it for a refresh", async () => {
    const store = createLobbyStore(connector);
    const settings = { ...DEFAULT_SETTINGS, holes: 3 as const };
    const code = await store.getState().createRoom(settings);

    expect(code).toBe("ABCDE");
    expect(connector.created).toEqual([settings]);
    expect(store.getState()).toMatchObject({
      connection: "connected",
      code: "ABCDE",
      myId: "me",
    });
    expect(loadSession()).toEqual({ code: "ABCDE", token: "token-me" });
  });

  it("explains when the server cannot be reached", async () => {
    connector.failCreate = true;
    const store = createLobbyStore(connector);
    expect(await store.getState().createRoom(DEFAULT_SETTINGS)).toBeNull();
    expect(store.getState().connection).toBe("idle");
    expect(store.getState().notice).toMatch(/server/i);
  });
});

describe("joining", () => {
  it.each([
    ["missing", /could not find/i],
    ["full", /full/i],
    ["started", /already started/i],
  ] as const)("does not connect to a %s room", async (status, message) => {
    connector.status = status;
    const store = createLobbyStore(connector);
    expect(await store.getState().joinRoom("ABCDE")).toBe(false);
    expect(connector.joined).toEqual([]);
    expect(store.getState().notice).toMatch(message);
  });

  it("connects to an open room", async () => {
    const store = createLobbyStore(connector);
    expect(await store.getState().joinRoom("ABCDE")).toBe(true);
    expect(connector.joined).toEqual(["ABCDE"]);
    expect(store.getState().connection).toBe("connected");
  });

  it("explains a connection that fails after the check", async () => {
    connector.failJoin = true;
    const store = createLobbyStore(connector);
    expect(await store.getState().joinRoom("ABCDE")).toBe(false);
    expect(store.getState().notice).toMatch(/could not join/i);
  });
});

describe("resuming after a refresh", () => {
  it("uses the saved token when it is for the same room", async () => {
    const first = createLobbyStore(connector);
    await first.getState().createRoom(DEFAULT_SETTINGS);

    const second = createLobbyStore(connector);
    expect(await second.getState().resume("ABCDE")).toBe(true);
    expect(connector.reconnected).toEqual(["token-me"]);
    expect(connector.joined).toEqual([]);
  });

  it("falls back to joining when the token no longer works", async () => {
    const first = createLobbyStore(connector);
    await first.getState().createRoom(DEFAULT_SETTINGS);
    connector.failReconnect = true;

    const second = createLobbyStore(connector);
    expect(await second.getState().resume("ABCDE")).toBe(true);
    expect(connector.joined).toEqual(["ABCDE"]);
  });

  it("does not connect twice if asked twice at once", async () => {
    const store = createLobbyStore(connector);
    await Promise.all([
      store.getState().resume("ABCDE"),
      store.getState().resume("ABCDE"),
    ]);
    expect(connector.rooms).toHaveLength(1);
  });

  it("just joins when there is nothing saved", async () => {
    const store = createLobbyStore(connector);
    await store.getState().resume("ABCDE");
    expect(connector.reconnected).toEqual([]);
    expect(connector.joined).toEqual(["ABCDE"]);
  });
});

describe("in the room", () => {
  it("keeps the latest lobby and game from the server", async () => {
    const store = createLobbyStore(connector);
    await store.getState().createRoom(DEFAULT_SETTINGS);
    const snapshot = lobby([player("me", "Ann", "visor")]);
    connector.room.emit("lobby", snapshot);
    expect(store.getState().lobby).toEqual(snapshot);
  });

  it("sends ready, then start", async () => {
    const store = createLobbyStore(connector);
    await store.getState().createRoom(DEFAULT_SETTINGS);
    store.getState().ready("Ann", "visor");
    store.getState().start();
    expect(connector.room.sent).toEqual([
      { type: "ready", payload: { name: "Ann", avatar: "visor" } },
      { type: "start", payload: undefined },
    ]);
  });

  it("shows a refusal until it is dismissed or the next request", async () => {
    const store = createLobbyStore(connector);
    await store.getState().createRoom(DEFAULT_SETTINGS);
    connector.room.emit("error", { code: "AVATAR_TAKEN" });
    expect(store.getState().error).toBe("AVATAR_TAKEN");
    store.getState().ready("Ann", "teal");
    expect(store.getState().error).toBeNull();
  });

  it("leaves on purpose and forgets the room", async () => {
    const store = createLobbyStore(connector);
    await store.getState().createRoom(DEFAULT_SETTINGS);
    const room = connector.room;
    await store.getState().leave();
    expect(room.left).toBe(true);
    expect(store.getState()).toMatchObject({ connection: "idle", code: null });
    expect(store.getState().notice).toBeNull();
    expect(loadSession()).toBeNull();
  });

  it("goes back to the start with a reason when the host closes the room", async () => {
    const store = createLobbyStore(connector);
    await store.getState().joinRoom("ABCDE");
    connector.room.emit("closed", { reason: "HOST_LEFT" });
    connector.room.end();
    expect(store.getState().connection).toBe("idle");
    expect(store.getState().notice).toMatch(/host left/i);
    expect(loadSession()).toBeNull();
  });

  it("ignores messages from a room we have already left", async () => {
    const store = createLobbyStore(connector);
    await store.getState().joinRoom("ABCDE");
    const old = connector.room;
    await store.getState().leave();
    old.emit("lobby", lobby([player("me", "Ann", "visor")]));
    expect(store.getState().lobby).toBeNull();
  });
});
