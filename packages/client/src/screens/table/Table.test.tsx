import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  render(<Table view={getPlayerView(game, viewer)} lobby={snapshot} />);
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

  it("shows the card being held only to the player holding it", () => {
    const base = createGame(DEFAULT_SETTINGS, ["p1", "p2"], () => 0.3);
    const drawn = base.deck.at(-1)!;
    const place: Partial<GameState> = {
      deck: base.deck.slice(0, -1),
      currentPlayerIndex: 0,
      phase: { type: "place", drawn, source: "deck" },
    };
    const held = () => screen.getByText("Ann holds").closest("figure")!;

    setup(2, "p1", place);
    expect(within(held()).getByAltText(/ of /)).toBeInTheDocument();
    cleanup();

    setup(2, "p2", place);
    expect(within(held()).getByAltText("Face-down card")).toBeInTheDocument();
  });

  it("shows a spectator the first player at the bottom", () => {
    setup(2, null);
    expect(seat("Ann")).toHaveClass("bottom");
  });
});
