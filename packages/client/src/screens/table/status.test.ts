import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  getPlayerView,
  type GameState,
} from "@golf/shared";
import { statusText } from "./status";

const names: Record<string, string> = { a: "Ann", b: "Bo" };
const nameOf = (id: string) => names[id] ?? id;
const game = (): GameState =>
  createGame(DEFAULT_SETTINGS, ["a", "b"], () => 0.5);

describe("statusText", () => {
  it("asks you to flip, then waits for the others", () => {
    const state = game();
    expect(statusText(getPlayerView(state, "a"), nameOf)).toBe(
      "Flip 2 of your cards",
    );
    const [first, second, ...rest] = state.players[0]!.grid;
    const flipped = {
      ...state,
      players: [
        {
          ...state.players[0]!,
          grid: [
            { ...first!, faceUp: true },
            { ...second!, faceUp: true },
            ...rest,
          ] as unknown as (typeof state.players)[0]["grid"],
        },
        state.players[1]!,
      ],
    };
    expect(statusText(getPlayerView(flipped, "a"), nameOf)).toBe(
      "Waiting for everyone to flip",
    );
  });

  it("tells a spectator what is going on", () => {
    expect(statusText(getPlayerView(game(), null), nameOf)).toBe(
      "Everyone is flipping their first cards",
    );
  });

  it("says whose turn it is", () => {
    const state: GameState = {
      ...game(),
      phase: { type: "flipOrDraw" },
      currentPlayerIndex: 1,
    };
    expect(statusText(getPlayerView(state, "a"), nameOf)).toBe("Bo's turn");
    expect(statusText(getPlayerView(state, "b"), nameOf)).toBe(
      "Your turn: flip a card or draw",
    );
  });

  it("only offers to discard a card from the draw pile", () => {
    const base = game();
    const card = base.deck.at(-1)!;
    const fromDeck: GameState = {
      ...base,
      currentPlayerIndex: 0,
      phase: { type: "place", drawn: card, source: "deck" },
    };
    const fromDiscard: GameState = {
      ...fromDeck,
      phase: { type: "place", drawn: card, source: "discard" },
    };
    expect(statusText(getPlayerView(fromDeck, "a"), nameOf)).toMatch(/discard/);
    expect(statusText(getPlayerView(fromDiscard, "a"), nameOf)).not.toMatch(
      /discard/,
    );
    expect(statusText(getPlayerView(fromDeck, "b"), nameOf)).toBe(
      "Ann is placing a card",
    );
  });

  it("announces the end of a hole and of the game", () => {
    const base = game();
    expect(
      statusText(
        getPlayerView({ ...base, phase: { type: "holeOver" } }, "a"),
        nameOf,
      ),
    ).toBe("Hole over");
    expect(
      statusText(
        getPlayerView({ ...base, phase: { type: "gameOver" } }, "a"),
        nameOf,
      ),
    ).toBe("Game over");
  });
});
