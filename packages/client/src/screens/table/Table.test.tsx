import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  getPlayerView,
  type AvatarId,
  type GameState,
} from "@golf/shared";
import { lobby, player } from "../../test/fakes";
import { Table } from "./Table";

const AVATARS: AvatarId[] = ["visor", "teal", "lavender", "bucket"];
const NAMES = ["Ann", "Ben", "Cy", "Di"];

function setup(
  count: number,
  viewer: string | null,
  state?: Partial<GameState>,
  onLeave = vi.fn(),
) {
  const ids = NAMES.slice(0, count).map((_, i) => `p${i + 1}`);
  const game: GameState = {
    ...createGame({ ...DEFAULT_SETTINGS, maxPlayers: 4 }, ids, () => 0.3),
    ...state,
  };
  const snapshot = lobby(
    ids.map((id, i) =>
      player(id, NAMES[i]!, AVATARS[i]!, { isBot: i === count - 1 && i > 1 }),
    ),
    { started: true },
  );
  const onAct = vi.fn();
  render(
    <Table
      view={getPlayerView(game, viewer)}
      lobby={snapshot}
      onAct={onAct}
      onLeave={onLeave}
    />,
  );
  return onAct;
}

const seat = (name: string) => screen.getByRole("region", { name });

describe("Table", () => {
  it("shows every player with a name, a portrait and six cards", () => {
    setup(4, "p1");
    expect(screen.getAllByRole("region", { name: /./ })).toHaveLength(4);
    expect(seat("Ann (you)")).toBeInTheDocument();
    for (const name of ["Ben", "Cy", "Di"]) {
      const region = seat(name);
      expect(within(region).getAllByAltText("Face-down card")).toHaveLength(6);
    }
    expect(screen.getByAltText("Teal")).toBeInTheDocument();
    expect(screen.getByAltText("Lavender")).toBeInTheDocument();
    expect(screen.getByAltText("Bucket hat")).toBeInTheDocument();
  });

  it("puts the viewer at the bottom with full cards, and others in mini", () => {
    setup(3, "p2");
    expect(seat("Ben (you)")).toHaveClass("bottom");
    expect(seat("Cy")).toHaveClass("left");
    expect(seat("Ann")).toHaveClass("right");
    expect(
      within(seat("Ben (you)")).getAllByAltText("Face-down card")[0],
    ).toHaveClass("full");
    expect(
      within(seat("Ann")).getAllByAltText("Face-down card")[0],
    ).toHaveClass("mini");
  });

  it("shows two players top and bottom", () => {
    setup(2, "p1");
    expect(seat("Ann (you)")).toHaveClass("bottom");
    expect(seat("Ben")).toHaveClass("top");
  });

  it("shows face-up cards by name and never reveals face-down ones", () => {
    const base = createGame(DEFAULT_SETTINGS, ["p1", "p2"], () => 0.3);
    const [first, ...rest] = base.players[0]!.grid;
    const players = [
      {
        ...base.players[0]!,
        grid: [
          { ...first!, faceUp: true },
          ...rest,
        ] as unknown as GameState["players"][0]["grid"],
      },
      base.players[1]!,
    ];
    setup(2, "p1", { players });
    const mine = within(seat("Ann (you)"));
    expect(mine.getAllByAltText("Face-down card")).toHaveLength(5);
    expect(mine.getByAltText(/ of /)).toBeInTheDocument();
  });

  it("marks whose turn it is and who deals", () => {
    setup(3, "p1");
    // The player after the dealer goes first.
    expect(seat("Ben")).toHaveAttribute("aria-current", "true");
    expect(seat("Ann (you)")).not.toHaveAttribute("aria-current");
    expect(within(seat("Ann (you)")).getByText("Dealer")).toBeInTheDocument();
    expect(within(seat("Cy")).getByText("Bot")).toBeInTheDocument();
  });

  it("shows the piles and the hole", () => {
    setup(2, "p1");
    const piles = within(screen.getByRole("group", { name: "Piles" }));
    expect(piles.getByText(/Draw \(\d+\)/)).toBeInTheDocument();
    expect(piles.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      `Hole 1 of ${DEFAULT_SETTINGS.holes}`,
    );
  });

  describe("a card being placed", () => {
    const placing = (source: "deck" | "discard"): Partial<GameState> => {
      const base = createGame(DEFAULT_SETTINGS, ["p1", "p2"], () => 0.3);
      return {
        deck: base.deck.slice(0, -1),
        currentPlayerIndex: 0,
        phase: { type: "place", drawn: base.deck.at(-1)!, source },
      };
    };
    const pile = (name: RegExp) =>
      screen.getByText(name).closest("figure") as HTMLElement;

    it("floats the card over your own hand, for you only", () => {
      setup(2, "p1", placing("deck"));
      const held = screen.getByRole("group", { name: "Your drawn card" });
      expect(within(held).getByAltText(/ of /)).toBeInTheDocument();
      expect(seat("Ann (you)")).toContainElement(held);
      cleanup();

      setup(2, "p2", placing("deck"));
      expect(
        screen.queryByRole("group", { name: "Your drawn card" }),
      ).not.toBeInTheDocument();
      // Nobody sees another player's held card, not even its back.
      expect(
        within(screen.getByRole("group", { name: "Piles" })).getAllByRole(
          "img",
        ),
      ).toHaveLength(2);
    });

    it("highlights the pile the card was taken from", () => {
      setup(2, "p2", placing("deck"));
      expect(pile(/Draw/)).toHaveAttribute("data-active", "true");
      expect(pile(/Discard/)).toHaveAttribute("data-active", "false");
      cleanup();

      setup(2, "p2", placing("discard"));
      expect(pile(/Draw/)).toHaveAttribute("data-active", "false");
      expect(pile(/Discard/)).toHaveAttribute("data-active", "true");
    });

    it("highlights nothing the rest of the time", () => {
      setup(2, "p1");
      expect(pile(/Draw/)).toHaveAttribute("data-active", "false");
      expect(pile(/Discard/)).toHaveAttribute("data-active", "false");
    });
  });

  it("no longer shows scores or a leave button on the table", () => {
    setup(3, "p1");
    expect(screen.queryByText(/^Score/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /leave/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a spectator the first player at the bottom", () => {
    setup(2, null);
    expect(seat("Ann")).toHaveClass("bottom");
  });

  describe("clicking", () => {
    it("flips a card with a click during the first flips", async () => {
      const onAct = setup(2, "p1");
      await userEvent.click(
        screen.getByRole("button", { name: "Flip your top middle card" }),
      );
      expect(onAct).toHaveBeenCalledWith({ type: "flipInitial", slot: 1 });
    });

    it("never makes other players' cards or the piles clickable then", () => {
      setup(3, "p1");
      expect(screen.getAllByRole("button", { name: /^Flip/ })).toHaveLength(6);
      expect(within(seat("Ben")).queryByRole("button")).not.toBeInTheDocument();
    });

    it("draws from either pile on your turn", async () => {
      const onAct = setup(2, "p2", {
        phase: { type: "flipOrDraw" },
        currentPlayerIndex: 1,
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Draw from the deck" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Take the top discard" }),
      );
      expect(onAct.mock.calls).toEqual([
        [{ type: "drawFromDeck" }],
        [{ type: "drawFromDiscard" }],
      ]);
    });

    it("swaps or discards the card you drew", async () => {
      const base = createGame(DEFAULT_SETTINGS, ["p1", "p2"], () => 0.3);
      const onAct = setup(2, "p1", {
        deck: base.deck.slice(0, -1),
        currentPlayerIndex: 0,
        phase: { type: "place", drawn: base.deck.at(-1)!, source: "deck" },
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Swap into your bottom left card" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Discard the card you drew" }),
      );
      expect(onAct.mock.calls).toEqual([
        [{ type: "swapDrawn", slot: 3 }],
        [{ type: "discardDrawn" }],
      ]);
    });

    it("lets you press a card with the keyboard", async () => {
      const onAct = setup(2, "p1");
      await userEvent.tab(); // the menu button comes first
      await userEvent.tab();
      await userEvent.keyboard("{Enter}");
      expect(onAct).toHaveBeenCalledWith({ type: "flipInitial", slot: 0 });
    });

    it("makes nothing clickable when you have to wait", () => {
      setup(2, "p1", {
        phase: { type: "flipOrDraw" },
        currentPlayerIndex: 1,
      });
      expect(
        screen.queryAllByRole("button", {
          name: /^(Flip|Draw|Take|Swap|Discard)/,
        }),
      ).toHaveLength(0);
    });
  });
});
