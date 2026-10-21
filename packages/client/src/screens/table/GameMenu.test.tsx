import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  getPlayerView,
  type GameState,
} from "@golf/shared";
import { lobby, player } from "../../test/fakes";
import { GameMenu } from "./GameMenu";

function setup() {
  const start = createGame(
    { ...DEFAULT_SETTINGS, holes: 3 },
    ["p1", "p2"],
    () => 0.5,
  );
  const state: GameState = {
    ...start,
    players: [
      { ...start.players[0]!, holeScores: [4, -1] },
      { ...start.players[1]!, holeScores: [9, 2] },
    ],
  };
  const onLeave = vi.fn();
  render(
    <GameMenu
      view={getPlayerView(state, "p1")}
      lobby={lobby([player("p1", "Ann", "visor"), player("p2", "Bo", "teal")])}
      onLeave={onLeave}
    />,
  );
  return { onLeave, user: userEvent.setup() };
}

const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Menu" }));

describe("the game menu", () => {
  it("starts closed and opens with the hamburger button", async () => {
    const { user } = setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await openMenu(user);
    const menu = within(screen.getByRole("menu"));
    expect(menu.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "View scores",
      "Leave room",
    ]);
  });

  it("closes on Escape, a second click, or a click elsewhere", async () => {
    const { user } = setup();
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openMenu(user);
    await openMenu(user);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openMenu(user);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows the scores in a box with a close button", async () => {
    const { user } = setup();
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "View scores" }));

    const sheet = within(screen.getByRole("dialog", { name: "Scores" }));
    expect(sheet.getByText("Ann (you)")).toBeInTheDocument();
    expect(sheet.getByText("Bo")).toBeInTheDocument();
    // A row per hole of the game, played or not, and a total.
    const rows = sheet.getAllByRole("row").slice(1);
    // Hole number, then each player's score; the last row is the totals.
    expect(rows.map((r) => r.textContent)).toEqual([
      "149",
      "2-12",
      "3",
      "Total311",
    ]);

    await user.click(sheet.getByRole("button", { name: "Close scores" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the score sheet with Escape", async () => {
    const { user } = setup();
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "View scores" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before leaving, and stays if you say so", async () => {
    const { user, onLeave } = setup();
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Leave room" }));
    expect(
      screen.getByRole("dialog", { name: "Are you sure?" }),
    ).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("leaves once you confirm", async () => {
    const { user, onLeave } = setup();
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Leave room" }));
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("treats Escape and the X on the question as staying", async () => {
    const { user, onLeave } = setup();
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Leave room" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
