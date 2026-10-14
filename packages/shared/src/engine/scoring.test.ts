import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards";
import {
  cardValue,
  getWinnerIds,
  scoreGrid,
  scoreHole,
  totalScore,
} from "./scoring";
import {
  DEFAULT_SETTINGS,
  GameSettingsSchema,
  type GameSettings,
} from "./settings";
import type { Grid, PlayerState, Tuple6 } from "./state";

function card(rank: Rank, index: number): Card {
  const id = `test-${index}`;
  return { id, rank, suit: "spades" };
}

/** Build a face-up grid from six ranks, laid out row by row (see state.ts). */
function grid(ranks: Tuple6<Rank>): Grid {
  const cards = ranks.map((rank, index) => ({
    card: card(rank, index),
    faceUp: true,
  }));
  return cards as unknown as Grid;
}

function player(
  id: string,
  ranks: Tuple6<Rank>,
  holeScores: number[] = [],
): PlayerState {
  return { id, grid: grid(ranks), holeScores };
}

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("cardValue", () => {
  it("scores ace as 1, number cards at face value, jack as 11, queen as 12, and king as 0", () => {
    expect(cardValue(card("A", 0))).toBe(1);
    expect(cardValue(card("2", 0))).toBe(2);
    expect(cardValue(card("10", 0))).toBe(10);
    expect(cardValue(card("J", 0))).toBe(11);
    expect(cardValue(card("Q", 0))).toBe(12);
    expect(cardValue(card("K", 0))).toBe(0);
  });
});

describe("scoreGrid", () => {
  it("adds up all six cards when no column matches", () => {
    // Columns: (A,3) (2,4) (5,6)
    expect(scoreGrid(grid(["A", "2", "5", "3", "4", "6"]))).toBe(21);
  });

  it("scores a matching column as zero", () => {
    // Columns: (5,5) (2,4) (K,K)
    expect(scoreGrid(grid(["5", "2", "K", "5", "4", "K"]))).toBe(6);
  });

  it("scores zero when every column matches", () => {
    expect(scoreGrid(grid(["7", "8", "9", "7", "8", "9"]))).toBe(0);
  });

  it("only matches within a column, not across a row", () => {
    // Row 1 is 5,5,5 but the columns are (5,A) (5,2) (5,3)
    expect(scoreGrid(grid(["5", "5", "5", "A", "2", "3"]))).toBe(21);
  });

  it("matches on rank, ignoring suit", () => {
    const g = grid(["9", "A", "A", "A", "A", "A"]);
    const withHearts: Grid = [
      { card: { id: "h", rank: "9", suit: "hearts" }, faceUp: true },
      ...g.slice(1),
    ] as unknown as Grid;
    // Column 0 is 9 of hearts over A (no match), columns 1 and 2 are (A,A) twice
    expect(scoreGrid(withHearts)).toBe(10);
  });
});

describe("scoreHole", () => {
  const a = player("a", ["A", "2", "3", "4", "5", "6"]); // 21
  const b = player("b", ["K", "K", "K", "K", "K", "K"]); // 0
  const c = player("c", ["10", "9", "8", "7", "6", "5"]); // 45

  it("scores each player independently by default", () => {
    expect(scoreHole([a, b, c])).toEqual({
      a: 21,
      b: 0,
      c: 45,
    });
  });
});

describe("totals and winners", () => {
  it("sums hole scores", () => {
    expect(totalScore({ holeScores: [4, -2, 10] })).toBe(12);
    expect(totalScore({ holeScores: [] })).toBe(0);
  });

  it("returns the lowest total as the winner", () => {
    const players = [
      player("a", ["A", "A", "A", "A", "A", "A"], [10, 5]),
      player("b", ["A", "A", "A", "A", "A", "A"], [3, 4]),
    ];
    expect(getWinnerIds(players)).toEqual(["b"]);
  });

  it("returns every player tied for lowest", () => {
    const players = [
      player("a", ["A", "A", "A", "A", "A", "A"], [3]),
      player("b", ["A", "A", "A", "A", "A", "A"], [3]),
      player("c", ["A", "A", "A", "A", "A", "A"], [9]),
    ];
    expect(getWinnerIds(players)).toEqual(["a", "b"]);
  });

  it("returns nobody for an empty game", () => {
    expect(getWinnerIds([])).toEqual([]);
  });
});

describe("GameSettingsSchema", () => {
  it("fills in the standard rules from an empty object", () => {
    expect(GameSettingsSchema.parse({})).toEqual({
      private: true,
      maxPlayers: 4,
      holes: 9,
      bots: false,
    });
  });

  it("rejects out-of-range values", () => {
    expect(GameSettingsSchema.safeParse({ holes: 0 }).success).toBe(false);
    expect(GameSettingsSchema.safeParse({ holes: 19 }).success).toBe(false);
    expect(GameSettingsSchema.safeParse({ maxPlayers: 1 }).success).toBe(false);
    expect(GameSettingsSchema.safeParse({ maxPlayers: 7 }).success).toBe(false);
  });
});
