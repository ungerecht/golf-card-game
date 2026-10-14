import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { getLegalActions, validateAction } from "./rules";
import { ALL_FACE_UP, makeCard, makePlayer, makeState } from "./test-helpers";

const ranks = ["A", "2", "3", "4", "5", "6"] as const;

function types(actions: Action[]): string[] {
  return actions.map((action) => action.type);
}

function slotsOf(actions: Action[], type: Action["type"]): number[] {
  return actions.flatMap((action) =>
    action.type === type && "slot" in action ? [action.slot] : [],
  );
}

describe("getLegalActions in the initial flip", () => {
  const phase = {
    type: "initialFlip",
    flipsRequired: 2,
    contenders: ["a", "b"],
  } as const;

  it("lets every player flip any face-down card, in any order", () => {
    const state = makeState({
      phase,
      players: [makePlayer("a", ranks), makePlayer("b", ranks)],
    });
    expect(slotsOf(getLegalActions(state, "a"), "flipInitial")).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(slotsOf(getLegalActions(state, "b"), "flipInitial")).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("only offers face-down slots", () => {
    const state = makeState({
      phase,
      players: [makePlayer("a", ranks, [0]), makePlayer("b", ranks)],
    });
    expect(slotsOf(getLegalActions(state, "a"), "flipInitial")).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("offers nothing to a player who already flipped enough", () => {
    const state = makeState({
      phase,
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });
    expect(getLegalActions(state, "a")).toEqual([]);
    expect(validateAction(state, "a", { type: "flipInitial", slot: 2 })).toBe(
      "ALREADY_FLIPPED_ENOUGH",
    );
    expect(getLegalActions(state, "b")).not.toEqual([]);
  });

  it("allows nothing else during the initial flip", () => {
    const state = makeState({
      phase,
      players: [makePlayer("a", ranks), makePlayer("b", ranks)],
    });
    expect(validateAction(state, "a", { type: "drawFromDeck" })).toBe(
      "WRONG_PHASE",
    );
    expect(validateAction(state, "a", { type: "flip", slot: 0 })).toBe(
      "WRONG_PHASE",
    );
  });
});

describe("getLegalActions on a turn", () => {
  const state = makeState({
    deck: [makeCard("9")],
    players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0, 1])],
  });

  it("offers the current player a flip of each face-down card and both draws", () => {
    const actions = getLegalActions(state, "a");
    expect(slotsOf(actions, "flip")).toEqual([2, 3, 4, 5]);
    expect(types(actions)).toContain("drawFromDeck");
    expect(types(actions)).toContain("drawFromDiscard");
    expect(types(actions)).not.toContain("swapDrawn");
    expect(types(actions)).not.toContain("discardDrawn");
  });

  it("offers nothing to a player whose turn it is not", () => {
    expect(getLegalActions(state, "b")).toEqual([]);
    expect(validateAction(state, "b", { type: "drawFromDeck" })).toBe(
      "NOT_YOUR_TURN",
    );
    expect(validateAction(state, "b", { type: "flip", slot: 2 })).toBe(
      "NOT_YOUR_TURN",
    );
  });

  it("rejects flipping a card that is already face up", () => {
    expect(validateAction(state, "a", { type: "flip", slot: 0 })).toBe(
      "SLOT_FACE_UP",
    );
  });

  it("rejects strangers", () => {
    expect(getLegalActions(state, "nobody")).toEqual([]);
    expect(validateAction(state, "nobody", { type: "drawFromDeck" })).toBe(
      "NOT_A_PLAYER",
    );
  });
});

describe("flipping when every card is face up", () => {
  // This is the situation on the final turns after someone goes out, and in the
  // rare case where every card is face up before the first turn.
  const state = makeState({
    deck: [makeCard("9")],
    players: [makePlayer("a", ranks, ALL_FACE_UP), makePlayer("b", ranks, [0])],
  });

  it("is not a legal action, with a clear reason", () => {
    expect(validateAction(state, "a", { type: "flip", slot: 0 })).toBe(
      "NO_FACE_DOWN_CARD",
    );
    expect(slotsOf(getLegalActions(state, "a"), "flip")).toEqual([]);
  });

  it("still leaves the player both draws, so they are never stuck", () => {
    expect(types(getLegalActions(state, "a"))).toEqual([
      "drawFromDeck",
      "drawFromDiscard",
    ]);
  });
});

describe("getLegalActions after drawing", () => {
  const players = [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks)];

  it("after drawing from the deck: swap into any slot, or discard", () => {
    const state = makeState({
      players,
      phase: { type: "place", drawn: makeCard("9"), source: "deck" },
    });
    const actions = getLegalActions(state, "a");
    expect(slotsOf(actions, "swapDrawn")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(types(actions)).toContain("discardDrawn");
    expect(getLegalActions(state, "b")).toEqual([]);
  });

  it("after drawing from the discard pile: swap only", () => {
    const state = makeState({
      players,
      phase: { type: "place", drawn: makeCard("9"), source: "discard" },
    });
    const actions = getLegalActions(state, "a");
    expect(slotsOf(actions, "swapDrawn")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(types(actions)).not.toContain("discardDrawn");
    expect(validateAction(state, "a", { type: "discardDrawn" })).toBe(
      "MUST_SWAP",
    );
  });

  it("does not let you draw again while holding a card", () => {
    const state = makeState({
      players,
      phase: { type: "place", drawn: makeCard("9"), source: "deck" },
    });
    expect(validateAction(state, "a", { type: "drawFromDeck" })).toBe(
      "WRONG_PHASE",
    );
    expect(validateAction(state, "a", { type: "flip", slot: 2 })).toBe(
      "WRONG_PHASE",
    );
  });
});

describe("drawing from the draw pile", () => {
  const players = [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks)];

  it("is allowed with an empty pile when the discard pile can be reshuffled", () => {
    const state = makeState({
      players,
      deck: [],
      discard: [makeCard("2"), makeCard("3"), makeCard("4")],
    });
    expect(types(getLegalActions(state, "a"))).toContain("drawFromDeck");
  });

  it("is refused when both piles are as empty as they can get", () => {
    const state = makeState({ players, deck: [], discard: [makeCard("2")] });
    expect(validateAction(state, "a", { type: "drawFromDeck" })).toBe(
      "DECK_EMPTY",
    );
    expect(types(getLegalActions(state, "a"))).toContain("drawFromDiscard");
  });
});

describe("getLegalActions between holes and after the game", () => {
  const players = [
    makePlayer("a", ranks, ALL_FACE_UP),
    makePlayer("b", ranks, ALL_FACE_UP),
  ];

  it("lets anyone start the next hole once a hole is over", () => {
    const state = makeState({ players, phase: { type: "holeOver" } });
    expect(getLegalActions(state, "a")).toEqual([{ type: "startNextHole" }]);
    expect(getLegalActions(state, "b")).toEqual([{ type: "startNextHole" }]);
  });

  it("offers nothing once the game is over", () => {
    const state = makeState({ players, phase: { type: "gameOver" } });
    expect(getLegalActions(state, "a")).toEqual([]);
    expect(validateAction(state, "a", { type: "startNextHole" })).toBe(
      "WRONG_PHASE",
    );
  });

  it("does not allow starting a hole in the middle of play", () => {
    const state = makeState({ players });
    expect(validateAction(state, "a", { type: "startNextHole" })).toBe(
      "WRONG_PHASE",
    );
  });
});
