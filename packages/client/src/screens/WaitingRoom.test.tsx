import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, createGame, getPlayerView } from "@golf/shared";
import { saveProfile } from "../net/storage";
import { FakeConnector, gameUpdate, lobby, player } from "../test/fakes";
import { renderApp } from "../test/render";

/** Host a room and wait for the waiting room. */
async function hosting(settings: Record<string, unknown> = {}) {
  const app = renderApp("/host");
  if (Object.keys(settings).length > 0) {
    for (const [label, value] of Object.entries(settings)) {
      await app.user.selectOptions(screen.getByLabelText(label), String(value));
    }
  }
  await app.user.click(screen.getByRole("button", { name: "Create Room" }));
  await screen.findByRole("heading", { name: "Waiting room" });
  return app;
}

/** Joining through the landing page, as a guest. */
async function joining() {
  const app = renderApp("/");
  await app.user.type(screen.getByLabelText("Room code"), "abcde");
  await app.user.click(screen.getByRole("button", { name: "Join" }));
  await screen.findByRole("heading", { name: "Waiting room" });
  return app;
}

const slots = () => within(screen.getByRole("list", { name: "Players" }));
const send = (
  app: Awaited<ReturnType<typeof hosting>>,
  l: ReturnType<typeof lobby>,
) => act(() => app.connector.room.emit("lobby", l));

describe("the waiting room", () => {
  it("shows the code and one placeholder per player the room allows", async () => {
    const app = await hosting({ "Max players": 3 });
    send(app, lobby([], {}, { maxPlayers: 3 }));
    expect(screen.getByTestId("room-code")).toHaveTextContent("ABCDE");
    expect(slots().getAllByRole("listitem")).toHaveLength(3);
    expect(slots().getAllByText("Open")).toHaveLength(3);
  });

  it("calls empty slots bots when bots are on", async () => {
    const app = await hosting();
    send(app, lobby([], {}, { bots: true }));
    expect(slots().getAllByText("Bot")).toHaveLength(4);
  });

  it("fills slots in order with the avatar and name below it", async () => {
    const app = await hosting();
    send(
      app,
      lobby([player("me", "Ann", "visor"), player("b", "Ben", "teal")]),
    );
    const items = slots().getAllByRole("listitem");
    expect(within(items[0]!).getByText("Ann (you)")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Host")).toBeInTheDocument();
    expect(within(items[0]!).getByAltText("Visor")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Ben")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Open")).toBeInTheDocument();
  });

  it("lets a player choose an avatar and name, then press Ready", async () => {
    const app = await hosting();
    send(app, lobby([]));
    const ready = screen.getByRole("button", { name: "Ready" });
    expect(ready).toBeDisabled();

    await app.user.type(screen.getByLabelText("Your name"), "Ann");
    expect(ready).toBeDisabled();
    await app.user.click(screen.getByRole("button", { name: "Lavender" }));
    expect(ready).toBeEnabled();
    await app.user.click(ready);

    expect(app.connector.room.sentOfType("ready")).toEqual([
      { name: "Ann", avatar: "lavender" },
    ]);
  });

  it("swaps the picker for the avatar once the server seats us", async () => {
    const app = await hosting();
    send(app, lobby([]));
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    send(app, lobby([player("me", "Ann", "lavender")]));
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(slots().getByText("Ann (you)")).toBeInTheDocument();
  });

  it("greys out avatars that are taken and will not let you pick them", async () => {
    const app = await hosting();
    send(app, lobby([player("b", "Ben", "teal")]));
    const taken = screen.getByRole("button", { name: "Teal (taken)" });
    expect(taken).toBeDisabled();
    expect(screen.getByRole("button", { name: "Visor" })).toBeEnabled();
  });

  it("drops our pick if someone else takes that avatar first", async () => {
    const app = await hosting();
    send(app, lobby([]));
    await app.user.type(screen.getByLabelText("Your name"), "Ann");
    await app.user.click(screen.getByRole("button", { name: "Chip" }));
    expect(screen.getByRole("button", { name: "Ready" })).toBeEnabled();

    send(app, lobby([player("b", "Ben", "chip")]));
    expect(screen.getByRole("button", { name: "Ready" })).toBeDisabled();
  });

  it("shows the server's refusal", async () => {
    const app = await hosting();
    send(app, lobby([]));
    act(() => app.connector.room.emit("error", { code: "AVATAR_TAKEN" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/just picked/i);
  });

  it("remembers the name and avatar for next time", async () => {
    const app = await hosting();
    send(app, lobby([]));
    await app.user.type(screen.getByLabelText("Your name"), "Ann");
    await app.user.click(screen.getByRole("button", { name: "Ginger" }));
    await app.user.click(screen.getByRole("button", { name: "Ready" }));
    expect(JSON.parse(localStorage.getItem("golf.profile") ?? "{}")).toEqual({
      name: "Ann",
      avatar: "ginger",
    });
  });

  it("starts with the remembered name and avatar filled in", async () => {
    saveProfile({ name: "Ann", avatar: "bucket" });
    const app = await hosting();
    send(app, lobby([]));
    expect(screen.getByLabelText("Your name")).toHaveValue("Ann");
    expect(screen.getByRole("button", { name: "Bucket hat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Ready" })).toBeEnabled();
  });
});

describe("starting and leaving", () => {
  it("only offers Start Game to the host, and only with enough players", async () => {
    const app = await hosting();
    send(app, lobby([player("me", "Ann", "visor")]));
    expect(screen.getByRole("button", { name: "Start Game" })).toBeDisabled();

    send(
      app,
      lobby([player("me", "Ann", "visor"), player("b", "Ben", "teal")]),
    );
    const start = screen.getByRole("button", { name: "Start Game" });
    expect(start).toBeEnabled();
    await app.user.click(start);
    expect(app.connector.room.sentOfType("start")).toHaveLength(1);
  });

  it("lets the host start alone when bots will fill the table", async () => {
    const app = await hosting();
    send(app, lobby([player("me", "Ann", "visor")], {}, { bots: true }));
    expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
  });

  it("keeps Start Game disabled until the host has a seat", async () => {
    const app = await hosting();
    send(app, lobby([player("b", "Ben", "teal"), player("c", "Cy", "chip")]));
    expect(screen.getByRole("button", { name: "Start Game" })).toBeDisabled();
  });

  it("gives guests no Start Game button, only a wait message", async () => {
    const app = await joining();
    send(
      app,
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
      }),
    );
    expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave Room" })).toBeEnabled();
  });

  it("goes to the game page for everyone once the game starts", async () => {
    const app = await joining();
    send(
      app,
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
        started: true,
      }),
    );
    expect(screen.getByText("Dealing the cards…")).toBeInTheDocument();
  });

  it("shows the table once the first game update arrives", async () => {
    const app = await joining();
    send(
      app,
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
        started: true,
      }),
    );
    const state = createGame(DEFAULT_SETTINGS, ["host", "me"], () => 0.5);
    act(() =>
      app.connector.room.emit("game", gameUpdate(getPlayerView(state, "me"))),
    );
    expect(
      screen.getByRole("region", { name: "Ben (you)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ann" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave Room" })).toBeEnabled();
  });

  it("sends the move you click to the server", async () => {
    const app = await joining();
    send(
      app,
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
        started: true,
      }),
    );
    const state = createGame(DEFAULT_SETTINGS, ["host", "me"], () => 0.5);
    act(() =>
      app.connector.room.emit("game", gameUpdate(getPlayerView(state, "me"))),
    );
    await app.user.click(
      screen.getByRole("button", { name: "Flip your bottom right card" }),
    );
    expect(app.connector.room.sentOfType("action")).toEqual([
      { type: "flipInitial", slot: 5 },
    ]);
  });

  it("tells you when the server refuses a move", async () => {
    const app = await joining();
    send(
      app,
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
        started: true,
      }),
    );
    const state = createGame(DEFAULT_SETTINGS, ["host", "me"], () => 0.5);
    act(() =>
      app.connector.room.emit("game", gameUpdate(getPlayerView(state, "me"))),
    );
    act(() => app.connector.room.emit("error", { code: "NOT_YOUR_TURN" }));
    expect(screen.getByRole("alert")).toHaveTextContent("not your turn");
  });

  it("goes to the landing page when someone leaves the room", async () => {
    const app = await joining();
    send(app, lobby([player("me", "Ben", "teal")], { hostId: "host" }));
    await app.user.click(screen.getByRole("button", { name: "Leave Room" }));
    expect(app.connector.room.left).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
  });

  it("sends everyone to the landing page, with a reason, when the host closes the room", async () => {
    const app = await joining();
    send(app, lobby([player("me", "Ben", "teal")], { hostId: "host" }));
    act(() => {
      app.connector.room.emit("closed", { reason: "HOST_LEFT" });
      app.connector.room.end();
    });
    expect(
      await screen.findByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/host left/i);
  });
});

describe("opening a room link directly", () => {
  it("connects to the room from the address", async () => {
    const app = renderApp("/room/abcde");
    expect(
      await screen.findByRole("heading", { name: "Waiting room" }),
    ).toBeInTheDocument();
    expect(app.connector.joined).toEqual(["ABCDE"]);
  });

  it("sends you to the landing page when the room does not exist", async () => {
    const missing = new FakeConnector();
    missing.status = "missing";
    const { connector } = renderApp("/room/ZZZZZ", missing);
    expect(
      await screen.findByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not find/i);
    expect(connector.joined).toEqual([]);
  });
});
