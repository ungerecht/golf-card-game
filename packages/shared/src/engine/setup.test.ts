import { describe, expect, it } from "vitest";
import { buildDeck, shuffle } from "./cards";
import { createSeededRng } from "./rng";
import { DEFAULT_SETTINGS } from "./settings";
import { createGame, dealHole } from "./setup";
import type { GameState } from "./state";
import { allCardIds } from "./test-helpers";

const SEED = 5;

function cardAt(state: GameState, seat: number, slot: 0 | 1 | 2 | 3 | 4 | 5) {
  return state.players[seat]?.grid[slot].card;
}

describe("createGame", () => {
  const ids = ["host", "b", "c"];
  const state = createGame(DEFAULT_SETTINGS, ids, createSeededRng(SEED));
  // The deck is dealt from its last element, so index 51 is the first card dealt.
  const shuffled = shuffle(buildDeck(), createSeededRng(SEED));

  it("deals one card at a time starting with the player to the dealer's left", () => {
    // The host is the dealer and sits in seat 0, so seat 1 gets the first card.
    expect(cardAt(state, 1, 0)).toEqual(shuffled[51]);
    expect(cardAt(state, 2, 0)).toEqual(shuffled[50]);
    expect(cardAt(state, 0, 0)).toEqual(shuffled[49]);
    expect(cardAt(state, 1, 1)).toEqual(shuffled[48]);
  });

  it("gives every player six face-down cards", () => {
    for (const p of state.players) {
      expect(p.grid).toHaveLength(6);
      expect(p.grid.every((gridCard) => !gridCard.faceUp)).toBe(true);
    }
  });

  it("starts the discard pile with the next card, face up in the pile", () => {
    expect(state.discard).toEqual([shuffled[51 - 18]]);
    expect(state.deck).toHaveLength(52 - 18 - 1);
  });

  it("accounts for every card exactly once", () => {
    const cardIds = allCardIds(state);
    expect(cardIds).toHaveLength(52);
    expect(new Set(cardIds).size).toBe(52);
  });

  it("starts hole 1 with the host as dealer and the initial flip phase", () => {
    expect(state.hole).toBe(1);
    expect(state.dealerIndex).toBe(0);
    expect(state.finalTurnTriggeredBy).toBeNull();
    expect(state.phase).toEqual({
      type: "initialFlip",
      flipsRequired: 2,
      contenders: ids,
    });
    expect(state.players.map((p) => p.holeScores)).toEqual([[], [], []]);
  });

  it("seats players in the order given", () => {
    expect(state.players.map((p) => p.id)).toEqual(ids);
  });

  it("gives the same deal for the same seed and a different one for another", () => {
    const again = createGame(DEFAULT_SETTINGS, ids, createSeededRng(SEED));
    const other = createGame(DEFAULT_SETTINGS, ids, createSeededRng(SEED + 1));
    expect(again).toEqual(state);
    expect(other).not.toEqual(state);
  });

  it("deals the right number of cards for two and four players", () => {
    const two = createGame(DEFAULT_SETTINGS, ["a", "b"], createSeededRng(1));
    expect(two.deck).toHaveLength(52 - 12 - 1);
    const four = createGame(
      DEFAULT_SETTINGS,
      ["a", "b", "c", "d"],
      createSeededRng(1),
    );
    expect(four.deck).toHaveLength(52 - 24 - 1);
  });

  it("rejects too few players, too many players and duplicate ids", () => {
    const rng = createSeededRng(1);
    expect(() => createGame(DEFAULT_SETTINGS, ["solo"], rng)).toThrow();
    expect(() =>
      createGame(DEFAULT_SETTINGS, ["a", "b", "c", "d", "e"], rng),
    ).toThrow();
    expect(() => createGame(DEFAULT_SETTINGS, ["a", "a"], rng)).toThrow();
    expect(() =>
      createGame(
        { ...DEFAULT_SETTINGS, maxPlayers: 3 },
        ["a", "b", "c", "d"],
        rng,
      ),
    ).toThrow();
  });
});

describe("dealHole", () => {
  it("starts dealing to the left of whoever deals, and keeps earlier scores", () => {
    const players = [
      { id: "a", holeScores: [4] },
      { id: "b", holeScores: [7] },
      { id: "c", holeScores: [1] },
    ];
    const shuffled = shuffle(buildDeck(), createSeededRng(9));
    const dealt = dealHole(players, 1, createSeededRng(9));

    // Seat 1 deals, so seat 2 gets the first card, then seat 0, then seat 1.
    expect(dealt.players[2]?.grid[0].card).toEqual(shuffled[51]);
    expect(dealt.players[0]?.grid[0].card).toEqual(shuffled[50]);
    expect(dealt.players[1]?.grid[0].card).toEqual(shuffled[49]);
    expect(dealt.players.map((p) => p.holeScores)).toEqual([[4], [7], [1]]);
  });
});
