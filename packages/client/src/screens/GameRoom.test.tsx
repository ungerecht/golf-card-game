import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  buildGameResult,
  createGame,
  getPlayerView,
  type GameResult,
  type GameState,
  type GameUpdate,
} from "@golf/shared";
import { gameUpdate, lobby, player } from "../test/fakes";
import { renderApp } from "../test/render";

const SETTINGS = { ...DEFAULT_SETTINGS, holes: 3 as const };
const ROSTER = [
  { id: "host", name: "Ann", avatar: "visor" as const, isBot: false },
  { id: "me", name: "Ben", avatar: "teal" as const, isBot: false },
];

/** Get into a started game as the host, or as a guest. */
async function inGame(asHost: boolean) {
  const app = renderApp(asHost ? "/host" : "/");
  if (asHost) {
    await app.user.click(screen.getByRole("button", { name: "Create Room" }));
  } else {
    await app.user.type(screen.getByLabelText("Room code"), "abcde");
    await app.user.click(screen.getByRole("button", { name: "Join" }));
  }
  await screen.findByRole("heading", { name: "Waiting room" });
  const hostId = asHost ? "me" : "host";
  act(() =>
    app.connector.room.emit(
      "lobby",
      lobby(
        [player("host", "Ann", "visor"), player("me", "Ben", "teal")],
        { hostId, started: true },
        SETTINGS,
      ),
    ),
  );
  return app;
}

type App = Awaited<ReturnType<typeof inGame>>;

const holeOver = (): GameState => {
  const start = createGame(SETTINGS, ["host", "me"], () => 0.5);
  return {
    ...start,
    phase: { type: "holeOver" },
    players: [
      { ...start.players[0]!, holeScores: [5] },
      { ...start.players[1]!, holeScores: [2] },
    ],
  };
};

const update = (state: GameState, extra: Partial<GameUpdate> = {}) => ({
  ...gameUpdate(getPlayerView(state, "me")),
  ...extra,
});

const send = (app: App, u: GameUpdate) =>
  act(() => app.connector.room.emit("game", u));

const gameOverResult = (): GameResult =>
  buildGameResult(
    [
      { id: "host", holeScores: [5, 3, 4] },
      { id: "me", holeScores: [2, 6, 1] },
    ],
    ROSTER,
  );

const gameOverUpdate = (): GameUpdate => {
  const state: GameState = {
    ...holeOver(),
    hole: 3,
    phase: { type: "gameOver" },
  };
  return update(state, { result: gameOverResult() });
};

describe("between holes", () => {
  it("shows how the hole went, best first, with a countdown", async () => {
    const app = await inGame(false);
    send(app, update(holeOver(), { serverTime: 1000, nextHoleAt: 31_000 }));

    const dialog = within(
      screen.getByRole("dialog", { name: "Hole 1 complete" }),
    );
    // Ben scored 2 and Ann 5, so Ben is listed first.
    const rows = dialog.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Ben (you)22", "Ann55"]);
    expect(dialog.getByRole("timer")).toHaveTextContent(
      "Next hole starts in 30s",
    );
  });

  it("makes a guest wait, and lets the host start the next hole", async () => {
    const guest = await inGame(false);
    send(guest, update(holeOver(), { nextHoleAt: 30_000 }));
    expect(
      screen.getByText(/waiting for the host to start hole 2/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start hole/ }),
    ).not.toBeInTheDocument();
  });

  it("sends the start when the host presses the button", async () => {
    const host = await inGame(true);
    send(host, update(holeOver(), { nextHoleAt: 30_000 }));
    await host.user.click(screen.getByRole("button", { name: "Start hole 2" }));
    expect(host.connector.room.sentOfType("action")).toEqual([
      { type: "startNextHole" },
    ]);
  });

  it("can be closed to look at the table, and brought back", async () => {
    const app = await inGame(false);
    send(app, update(holeOver(), { serverTime: 0, nextHoleAt: 30_000 }));
    await app.user.click(
      screen.getByRole("button", { name: "View the table" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Everyone's cards are still there.
    expect(screen.getByRole("region", { name: "Ann" })).toBeInTheDocument();

    await app.user.click(screen.getByRole("button", { name: "Show results" }));
    expect(
      screen.getByRole("dialog", { name: "Hole 1 complete" }),
    ).toBeInTheDocument();
  });

  it("goes away by itself when the next hole is dealt", async () => {
    const app = await inGame(false);
    send(app, update(holeOver(), { nextHoleAt: 30_000 }));
    const next: GameState = {
      ...holeOver(),
      hole: 2,
      phase: {
        type: "initialFlip",
        flipsRequired: 2,
        contenders: ["host", "me"],
      },
    };
    send(app, update(next));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Hole 2 of 3");
  });

  it("shows the summary again for the next hole after one was closed", async () => {
    const app = await inGame(false);
    send(app, update(holeOver(), { nextHoleAt: 30_000 }));
    await app.user.click(
      screen.getByRole("button", { name: "View the table" }),
    );
    const second: GameState = { ...holeOver(), hole: 2 };
    send(app, update(second, { nextHoleAt: 30_000 }));
    expect(
      screen.getByRole("dialog", { name: "Hole 2 complete" }),
    ).toBeInTheDocument();
  });
});

describe("the end of the game", () => {
  it("shows the winner and the final scores", async () => {
    const app = await inGame(false);
    send(app, gameOverUpdate());

    expect(
      screen.getByRole("heading", { name: "Game over" }),
    ).toBeInTheDocument();
    // Ben: 9. Ann: 12. So Ben wins.
    expect(screen.getByRole("status")).toHaveTextContent("You win!");
    const totals = within(screen.getByRole("table")).getAllByRole("row").at(-1);
    expect(totals).toHaveTextContent("Total912");
    // The table is gone, along with its menu.
    expect(
      screen.queryByRole("button", { name: "Menu" }),
    ).not.toBeInTheDocument();
  });

  it("lets the host play again", async () => {
    const host = await inGame(true);
    send(host, gameOverUpdate());
    await host.user.click(screen.getByRole("button", { name: "Play Again" }));
    expect(host.connector.room.sentOfType("playAgain")).toHaveLength(1);
  });

  it("makes a guest wait for the host", async () => {
    const guest = await inGame(false);
    send(guest, gameOverUpdate());
    expect(
      screen.queryByRole("button", { name: "Play Again" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
  });

  it("goes back to the table when a new game starts", async () => {
    const host = await inGame(true);
    send(host, gameOverUpdate());
    const fresh = createGame(SETTINGS, ["host", "me"], () => 0.5);
    send(host, update(fresh));
    expect(
      screen.queryByRole("heading", { name: "Game over" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Hole 1 of 3");
  });

  it("shows why Play Again was refused", async () => {
    const host = await inGame(true);
    send(host, gameOverUpdate());
    act(() =>
      host.connector.room.emit("error", { code: "NOT_ENOUGH_PLAYERS" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/two players/i);
  });

  it("leaves the room", async () => {
    const app = await inGame(false);
    send(app, gameOverUpdate());
    await app.user.click(screen.getByRole("button", { name: "Leave Room" }));
    expect(app.connector.room.left).toBe(true);
    expect(
      await screen.findByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
  });
});

describe("the countdown", () => {
  it("ticks down while the summary is showing", async () => {
    const app = await inGame(false);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      send(app, update(holeOver(), { serverTime: 0, nextHoleAt: 30_000 }));
      expect(screen.getByRole("timer")).toHaveTextContent("30s");
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.getByRole("timer")).toHaveTextContent("25s");
    } finally {
      vi.useRealTimers();
    }
  });
});
