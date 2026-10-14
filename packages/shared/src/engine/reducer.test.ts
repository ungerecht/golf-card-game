import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { buildDeck, shuffle } from "./cards";
import type { GameEvent } from "./events";
import { applyAction } from "./reducer";
import { createSeededRng } from "./rng";
import { getLegalActions } from "./rules";
import { scoreGrid } from "./scoring";
import type { GameState, PlayerState, SlotIndex } from "./state";
import {
  ALL_FACE_UP,
  allCardIds,
  deepFreeze,
  expectOk,
  makeCard,
  makePlayer,
  makeState,
  player,
} from "./test-helpers";

type Step = readonly [playerId: string, action: Action];

/** Apply actions in order, failing on the first illegal one. */
function run(state: GameState, steps: readonly Step[], seed = 1) {
  const rng = createSeededRng(seed);
  let current = state;
  const events: GameEvent[] = [];
  for (const [playerId, action] of steps) {
    const result = expectOk(applyAction(current, playerId, action, rng));
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function flips(playerId: string, ...slots: SlotIndex[]): Step[] {
  return slots.map((slot) => [playerId, { type: "flipInitial", slot }]);
}

function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function initialFlipState(
  players: PlayerState[],
  overrides: Partial<GameState> = {},
): GameState {
  return makeState({
    players,
    phase: {
      type: "initialFlip",
      flipsRequired: 2,
      contenders: players.map((p) => p.id),
    },
    ...overrides,
  });
}

describe("initial flip", () => {
  it("flips the chosen card face up and reports it", () => {
    const state = initialFlipState([
      makePlayer("a", ["2", "3", "4", "5", "6", "7"]),
      makePlayer("b", ["2", "3", "4", "5", "6", "7"]),
    ]);
    const { state: next, events } = run(state, flips("a", 2));

    expect(player(next, "a").grid[2].faceUp).toBe(true);
    expect(player(next, "a").grid[1].faceUp).toBe(false);
    expect(events).toEqual([
      {
        type: "flipped",
        playerId: "a",
        slot: 2,
        card: player(state, "a").grid[2].card,
      },
    ]);
  });

  it("does not let a player flip more than the round asks for", () => {
    const state = initialFlipState([
      makePlayer("a", ["2", "3", "4", "5", "6", "7"]),
      makePlayer("b", ["2", "3", "4", "5", "6", "7"]),
    ]);
    const afterTwo = run(state, flips("a", 0, 1)).state;
    expect(
      applyAction(
        afterTwo,
        "a",
        { type: "flipInitial", slot: 2 },
        createSeededRng(1),
      ),
    ).toEqual({ ok: false, error: "ALREADY_FLIPPED_ENOUGH" });
  });

  it("waits until everyone has flipped before choosing who goes first", () => {
    const state = initialFlipState([
      makePlayer("a", ["10", "J", "9", "9", "9", "9"]),
      makePlayer("b", ["2", "3", "Q", "Q", "Q", "Q"]),
    ]);
    const { state: next } = run(state, [...flips("a", 0, 1), ...flips("b", 0)]);
    expect(next.phase.type).toBe("initialFlip");
  });

  it("gives the first turn to the lowest showing score", () => {
    const state = initialFlipState([
      makePlayer("a", ["10", "J", "9", "9", "9", "9"]), // shows 10 + 11 = 21
      makePlayer("b", ["2", "3", "Q", "Q", "Q", "Q"]), // shows 2 + 3 = 5
    ]);
    const { state: next, events } = run(state, [
      ...flips("a", 0, 1),
      ...flips("b", 0, 1),
    ]);

    expect(next.phase).toEqual({ type: "flipOrDraw" });
    expect(next.currentPlayerIndex).toBe(1);
    expect(events.at(-1)).toEqual({ type: "firstPlayerChosen", playerId: "b" });
  });

  it("counts a matching column as zero when both cards are face up", () => {
    const state = initialFlipState([
      makePlayer("b", ["A", "A", "K", "K", "K", "K"]), // shows 1 + 1 = 2
      makePlayer("a", ["9", "K", "K", "9", "K", "K"]), // slots 0 and 3 match: shows 0
    ]);
    const { state: next } = run(state, [
      ...flips("b", 0, 1),
      ...flips("a", 0, 3),
    ]);
    expect(next.currentPlayerIndex).toBe(1);
  });

  describe("breaking a tie", () => {
    const grids = () => [
      makePlayer("a", ["2", "3", "9", "8", "8", "8"]), // 5 after two flips, 14 after a third
      makePlayer("b", ["A", "4", "10", "8", "8", "8"]), // 5 after two flips, 15 after a third
      // Shows 12 after slots 1 and 2, then 0 after slot 4 because Q over Q cancels.
      makePlayer("c", ["K", "Q", "K", "3", "Q", "7"]),
    ];

    it("makes everyone flip another card, with only the tied players still competing", () => {
      const state = initialFlipState(grids());
      const { state: next, events } = run(state, [
        ...flips("a", 0, 1),
        ...flips("b", 0, 1),
        ...flips("c", 1, 2),
      ]);

      expect(next.phase).toEqual({
        type: "initialFlip",
        flipsRequired: 3,
        contenders: ["a", "b"],
      });
      expect(events.at(-1)).toEqual({
        type: "tiebreak",
        contenders: ["a", "b"],
      });
      // The player who did not tie still flips, like everyone else.
      expect(getLegalActions(next, "c").map((a) => a.type)).toContain(
        "flipInitial",
      );
    });

    it("repeats with the new showing scores, and ignores players who were not tied", () => {
      const state = initialFlipState(grids());
      const { state: next, events } = run(state, [
        ...flips("a", 0, 1),
        ...flips("b", 0, 1),
        ...flips("c", 1, 2),
        ...flips("a", 2),
        ...flips("b", 2),
        ...flips("c", 4), // c now shows 0, lower than a and b, but is out of the running
      ]);

      expect(next.currentPlayerIndex).toBe(0);
      expect(next.phase).toEqual({ type: "flipOrDraw" });
      expect(events.at(-1)).toEqual({
        type: "firstPlayerChosen",
        playerId: "a",
      });
    });

    const lastFlip = (aLastRank: "7" | "A") => {
      // Everyone has five cards face up and flips the last one. Players a and c
      // tie (b is far behind). Dealer is b, so c sits closest to the dealer's left.
      const ranks = (last: string) =>
        ["2", "3", "4", "5", "6", last] as unknown as Parameters<
          typeof makePlayer
        >[1];
      return makeState({
        dealerIndex: 1,
        deck: [makeCard("9"), makeCard("10")],
        phase: {
          type: "initialFlip",
          flipsRequired: 6,
          contenders: ["a", "c"],
        },
        players: [
          makePlayer("a", ranks(aLastRank), [0, 1, 2, 3, 4]),
          makePlayer("b", ["Q", "J", "10", "9", "8", "7"], [0, 1, 2, 3, 4]),
          makePlayer("c", ranks("7"), [0, 1, 2, 3, 4]),
        ],
      });
    };

    it("when every card is face up and still tied, the tied player closest to the dealer's left goes first", () => {
      const { state: next } = run(lastFlip("7"), [
        ...flips("a", 5),
        ...flips("b", 5),
        ...flips("c", 5),
      ]);
      // a and c both score 27. Seat order from the dealer (b) goes c, then a.
      expect(next.currentPlayerIndex).toBe(2);
      expect(next.phase).toEqual({ type: "flipOrDraw" });
    });

    it("when the tie is broken on the very last flip, that player goes first", () => {
      const { state: next } = run(lastFlip("A"), [
        ...flips("a", 5),
        ...flips("b", 5),
        ...flips("c", 5),
      ]);
      expect(next.currentPlayerIndex).toBe(0);
    });

    it("then plays out with a single turn each, because every card is already face up", () => {
      const start = run(lastFlip("7"), [
        ...flips("a", 5),
        ...flips("b", 5),
        ...flips("c", 5),
      ]).state;

      // Player c goes first and cannot flip, so they must draw.
      expect(getLegalActions(start, "c").map((a) => a.type)).toEqual([
        "drawFromDeck",
        "drawFromDiscard",
      ]);

      const { state: end, events } = run(start, [
        ["c", { type: "drawFromDiscard" }],
        ["c", { type: "swapDrawn", slot: 0 }],
        ["a", { type: "drawFromDiscard" }],
        ["a", { type: "swapDrawn", slot: 0 }],
        ["b", { type: "drawFromDiscard" }],
        ["b", { type: "swapDrawn", slot: 0 }],
      ]);

      expect(events.filter((e) => e.type === "swapped")).toHaveLength(3);
      const wentOut = events.find((e) => e.type === "wentOut");
      expect(wentOut).toMatchObject({ playerId: "c", revealed: [] });
      expect(end.phase).toEqual({ type: "holeOver" });
      expect(end.players.every((p) => p.holeScores.length === 1)).toBe(true);
    });
  });
});

describe("taking a turn", () => {
  const ranks = ["2", "3", "4", "5", "6", "7"] as const;
  const fresh = () =>
    makeState({
      deck: [makeCard("8"), makeCard("9")],
      discard: [makeCard("3"), makeCard("K")],
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });

  it("flip: turns a face-down card up and passes the turn left", () => {
    const state = fresh();
    const { state: next, events } = run(state, [
      ["a", { type: "flip", slot: 2 }],
    ]);

    expect(player(next, "a").grid[2].faceUp).toBe(true);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toEqual({ type: "flipOrDraw" });
    expect(eventTypes(events)).toEqual(["flipped", "turnStarted"]);
  });

  it("rejects flipping a face-up card, and acting out of turn", () => {
    const state = fresh();
    const rng = createSeededRng(1);
    expect(applyAction(state, "a", { type: "flip", slot: 0 }, rng)).toEqual({
      ok: false,
      error: "SLOT_FACE_UP",
    });
    expect(applyAction(state, "b", { type: "flip", slot: 1 }, rng)).toEqual({
      ok: false,
      error: "NOT_YOUR_TURN",
    });
  });

  it("wraps around the table after the last player", () => {
    const state = makeState({
      currentPlayerIndex: 1,
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });
    const { state: next } = run(state, [["b", { type: "flip", slot: 1 }]]);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it("draw from the discard pile: takes the top card, which must then be swapped in", () => {
    const state = fresh();
    const king = state.discard[1];
    const sixth = player(state, "a").grid[4].card;

    const drawn = run(state, [["a", { type: "drawFromDiscard" }]]);
    expect(drawn.state.discard).toHaveLength(1);
    expect(drawn.state.phase).toEqual({
      type: "place",
      drawn: king,
      source: "discard",
    });
    expect(drawn.events).toEqual([
      { type: "drewFromDiscard", playerId: "a", card: king },
    ]);
    expect(drawn.state.currentPlayerIndex).toBe(0);

    const rng = createSeededRng(1);
    expect(
      applyAction(drawn.state, "a", { type: "discardDrawn" }, rng),
    ).toEqual({
      ok: false,
      error: "MUST_SWAP",
    });

    const swapped = run(drawn.state, [["a", { type: "swapDrawn", slot: 4 }]]);
    expect(player(swapped.state, "a").grid[4]).toEqual({
      card: king,
      faceUp: true,
    });
    // The replaced card was face down. It goes face up on the discard pile.
    expect(swapped.state.discard.at(-1)).toEqual(sixth);
    expect(swapped.state.discard).toHaveLength(2);
    expect(swapped.events[0]).toEqual({
      type: "swapped",
      playerId: "a",
      slot: 4,
      placed: king,
      replaced: sixth,
    });
    expect(swapped.state.currentPlayerIndex).toBe(1);
  });

  it("draw from the draw pile: the drawn card stays private, and can be discarded", () => {
    const state = fresh();
    const top = state.deck[1];

    const drawn = run(state, [["a", { type: "drawFromDeck" }]]);
    expect(drawn.state.deck).toHaveLength(1);
    expect(drawn.state.phase).toEqual({
      type: "place",
      drawn: top,
      source: "deck",
    });
    // The event must not reveal the card to the other players.
    expect(drawn.events).toEqual([{ type: "drewFromDeck", playerId: "a" }]);

    const discarded = run(drawn.state, [["a", { type: "discardDrawn" }]]);
    expect(discarded.state.discard.at(-1)).toEqual(top);
    expect(player(discarded.state, "a").grid).toEqual(player(state, "a").grid);
    expect(discarded.events).toEqual([
      { type: "discarded", playerId: "a", card: top },
      { type: "turnStarted", playerId: "b" },
    ]);
    expect(discarded.state.currentPlayerIndex).toBe(1);
  });

  it("draw from the draw pile: can be swapped into a card that is already face up", () => {
    const state = fresh();
    const top = state.deck[1];
    const replaced = player(state, "a").grid[0].card;
    const { state: next } = run(state, [
      ["a", { type: "drawFromDeck" }],
      ["a", { type: "swapDrawn", slot: 0 }],
    ]);
    expect(player(next, "a").grid[0]).toEqual({ card: top, faceUp: true });
    expect(next.discard.at(-1)).toEqual(replaced);
  });

  it("keeps every card accounted for through a turn", () => {
    const state = makeState({
      deck: [makeCard("8"), makeCard("9")],
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });
    const before = allCardIds(state).sort();
    const { state: next } = run(state, [
      ["a", { type: "drawFromDeck" }],
      ["a", { type: "swapDrawn", slot: 3 }],
    ]);
    expect(allCardIds(next).sort()).toEqual(before);
  });

  it("never changes the state it was given", () => {
    const state = deepFreeze(fresh());
    const snapshot = JSON.stringify(state);
    run(state, [
      ["a", { type: "drawFromDeck" }],
      ["a", { type: "swapDrawn", slot: 3 }],
    ]);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("returns an error and changes nothing when an action is illegal", () => {
    const state = deepFreeze(fresh());
    const result = applyAction(
      state,
      "a",
      { type: "swapDrawn", slot: 0 },
      createSeededRng(1),
    );
    expect(result).toEqual({ ok: false, error: "WRONG_PHASE" });
  });
});

describe("an empty draw pile", () => {
  const ranks = ["2", "3", "4", "5", "6", "7"] as const;

  it("reshuffles the discard pile, except its top card, into a new draw pile", () => {
    const d1 = makeCard("2");
    const d2 = makeCard("3");
    const d3 = makeCard("4");
    const top = makeCard("K");
    const state = makeState({
      deck: [],
      discard: [d1, d2, d3, top],
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });

    const seed = 3;
    const expected = shuffle([d1, d2, d3], createSeededRng(seed));
    const { state: next, events } = run(
      state,
      [["a", { type: "drawFromDeck" }]],
      seed,
    );

    expect(next.discard).toEqual([top]);
    expect(next.phase).toEqual({
      type: "place",
      drawn: expected.at(-1),
      source: "deck",
    });
    expect(next.deck).toEqual(expected.slice(0, -1));
    expect(eventTypes(events)).toEqual(["deckReshuffled", "drewFromDeck"]);
    expect(allCardIds(next).sort()).toEqual(allCardIds(state).sort());
  });

  it("does not reshuffle while there are still cards to draw", () => {
    const state = makeState({
      deck: [makeCard("9")],
      discard: [makeCard("2"), makeCard("3")],
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });
    const { events } = run(state, [["a", { type: "drawFromDeck" }]]);
    expect(eventTypes(events)).toEqual(["drewFromDeck"]);
  });

  it("refuses to draw when there is nothing to reshuffle", () => {
    const state = makeState({
      deck: [],
      discard: [makeCard("K")],
      players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
    });
    expect(
      applyAction(state, "a", { type: "drawFromDeck" }, createSeededRng(1)),
    ).toEqual({ ok: false, error: "DECK_EMPTY" });
  });
});

describe("going out", () => {
  // Scores for these grids when everything is face up:
  //   a: (2,5)=7 (3,6)=9 (4,7)=11 = 27
  //   b: (A,2)=3 three times = 9
  //   c: (K,4)=4 (2,5)=7 (3,6)=9 = 20
  const aRanks = ["2", "3", "4", "5", "6", "7"] as const;
  const bRanks = ["A", "A", "A", "2", "2", "2"] as const;
  const cRanks = ["K", "2", "3", "4", "5", "6"] as const;

  const threePlayers = () =>
    deepFreeze(
      makeState({
        deck: [makeCard("9"), makeCard("10")],
        discard: [makeCard("Q")],
        players: [
          makePlayer("a", aRanks, [0, 1, 2, 3, 4]),
          makePlayer("b", bRanks, [0]),
          makePlayer("c", cRanks, [0, 1]),
        ],
      }),
    );

  it("turning your last card up goes out and reveals everyone else's remaining cards", () => {
    const state = threePlayers();
    const { state: next, events } = run(state, [
      ["a", { type: "flip", slot: 5 }],
    ]);

    expect(next.finalTurnTriggeredBy).toBe("a");
    expect(next.players.every((p) => p.grid.every((g) => g.faceUp))).toBe(true);

    const expectedRevealed = [
      ...[1, 2, 3, 4, 5].map((slot) => ({
        playerId: "b",
        slot,
        card: player(state, "b").grid[slot as SlotIndex].card,
      })),
      ...[2, 3, 4, 5].map((slot) => ({
        playerId: "c",
        slot,
        card: player(state, "c").grid[slot as SlotIndex].card,
      })),
    ];
    expect(events.find((e) => e.type === "wentOut")).toEqual({
      type: "wentOut",
      playerId: "a",
      revealed: expectedRevealed,
    });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toEqual({ type: "flipOrDraw" });
  });

  it("gives every other player exactly one more turn, then scores the hole", () => {
    const { state: end, events } = run(threePlayers(), [
      ["a", { type: "flip", slot: 5 }],
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 0 }],
      ["c", { type: "drawFromDeck" }],
      ["c", { type: "discardDrawn" }],
    ]);

    expect(end.phase).toEqual({ type: "holeOver" });
    expect(end.hole).toBe(1);
    // The player who went out does not play again.
    expect(
      events.filter((e) => e.type === "turnStarted").map((e) => e.playerId),
    ).toEqual(["b", "c"]);

    const scored = events.find((e) => e.type === "holeScored");
    expect(scored).toEqual({
      type: "holeScored",
      scores: {
        a: 27,
        b: scoreGrid(player(end, "b").grid),
        c: scoreGrid(player(end, "c").grid),
      },
    });
    // b swapped a Q in for the first A, so the first column is now (Q,2) = 14.
    expect(player(end, "b").holeScores).toEqual([14 + 3 + 3]);
    expect(player(end, "a").holeScores).toEqual([27]);
    expect(player(end, "c").holeScores).toEqual([20]);
    expect(end.finalTurnTriggeredBy).toBe("a");
  });

  it("removes the flip option on the final turns", () => {
    const { state } = run(threePlayers(), [["a", { type: "flip", slot: 5 }]]);
    const rng = createSeededRng(1);
    expect(applyAction(state, "b", { type: "flip", slot: 1 }, rng)).toEqual({
      ok: false,
      error: "NO_FACE_DOWN_CARD",
    });
    expect(getLegalActions(state, "b").map((a) => a.type)).toEqual([
      "drawFromDeck",
      "drawFromDiscard",
    ]);
  });

  it("final-turn players can still draw and swap, or discard a card from the draw pile", () => {
    const { state } = run(threePlayers(), [["a", { type: "flip", slot: 5 }]]);
    const drawn = run(state, [["b", { type: "drawFromDeck" }]]).state;
    expect(getLegalActions(drawn, "b").map((a) => a.type)).toContain(
      "discardDrawn",
    );
  });

  it("also goes out by swapping a card into the last face-down slot", () => {
    const state = threePlayers();
    const { state: next, events } = run(state, [
      ["a", { type: "drawFromDiscard" }],
      ["a", { type: "swapDrawn", slot: 5 }],
    ]);
    expect(next.finalTurnTriggeredBy).toBe("a");
    expect(eventTypes(events)).toContain("wentOut");
  });

  it("does not go out while any card is still face down", () => {
    const state = makeState({
      deck: [makeCard("9")],
      players: [
        makePlayer("a", aRanks, [0, 1, 2, 3]),
        makePlayer("b", bRanks, [0]),
      ],
    });
    const { state: next, events } = run(state, [
      ["a", { type: "drawFromDeck" }],
      ["a", { type: "swapDrawn", slot: 0 }], // replaces a face-up card
    ]);
    expect(next.finalTurnTriggeredBy).toBeNull();
    expect(eventTypes(events)).not.toContain("wentOut");
  });

  it("works from any seat: play continues left and stops before the player who went out", () => {
    const state = makeState({
      currentPlayerIndex: 2,
      deck: [makeCard("9"), makeCard("10")],
      discard: [makeCard("Q"), makeCard("J"), makeCard("10")],
      players: [
        makePlayer("a", bRanks, [0]),
        makePlayer("b", bRanks, [0]),
        makePlayer("c", aRanks, [0, 1, 2, 3, 4]),
      ],
    });
    const afterOut = run(state, [["c", { type: "flip", slot: 5 }]]).state;
    expect(afterOut.currentPlayerIndex).toBe(0);

    const afterA = run(afterOut, [
      ["a", { type: "drawFromDiscard" }],
      ["a", { type: "swapDrawn", slot: 1 }],
    ]).state;
    expect(afterA.currentPlayerIndex).toBe(1);
    expect(afterA.phase).toEqual({ type: "flipOrDraw" });

    const afterB = run(afterA, [
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 1 }],
    ]).state;
    expect(afterB.phase).toEqual({ type: "holeOver" });
  });

  it("with two players, the other player takes one turn and the hole ends", () => {
    const state = makeState({
      players: [
        makePlayer("a", aRanks, [0, 1, 2, 3, 4]),
        makePlayer("b", bRanks, [0]),
      ],
    });
    const { state: end, events } = run(state, [
      ["a", { type: "flip", slot: 5 }],
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 2 }],
    ]);
    expect(end.phase).toEqual({ type: "holeOver" });
    expect(events.filter((e) => e.type === "turnStarted")).toHaveLength(1);
  });
});

describe("scoring holes and finishing the game", () => {
  const matching = ["5", "6", "7", "5", "6", "7"] as const;
  const alsoMatching = ["9", "8", "7", "9", "8", "7"] as const;

  const lastHole = () =>
    makeState({
      hole: 3,
      discard: [makeCard("K")],
      players: [
        makePlayer("a", matching, [0, 1, 2, 3, 4], [3, 4]),
        makePlayer("b", alsoMatching, [0], [8, 2]),
      ],
    });

  it("moves to the next hole's waiting state after a hole that is not the last", () => {
    const state = makeState({
      hole: 1,
      discard: [makeCard("K")],
      players: [
        makePlayer("a", matching, [0, 1, 2, 3, 4]),
        makePlayer("b", alsoMatching, [0]),
      ],
    });
    const { state: end, events } = run(state, [
      ["a", { type: "flip", slot: 5 }],
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 0 }],
    ]);
    expect(end.phase).toEqual({ type: "holeOver" });
    expect(eventTypes(events)).not.toContain("gameOver");
  });

  it("ends the game after the last hole and names the lowest total as the winner", () => {
    const { state: end, events } = run(lastHole(), [
      ["a", { type: "flip", slot: 5 }], // a scores 0: every column matches
      ["b", { type: "drawFromDiscard" }], // K goes over a 9: column 0 now scores 9
      ["b", { type: "swapDrawn", slot: 0 }],
    ]);

    expect(player(end, "a").holeScores).toEqual([3, 4, 0]);
    expect(player(end, "b").holeScores).toEqual([8, 2, 9]);
    expect(end.phase).toEqual({ type: "gameOver" });
    expect(events.at(-1)).toEqual({ type: "gameOver", winnerIds: ["a"] });
    expect(getLegalActions(end, "a")).toEqual([]);
    expect(getLegalActions(end, "b")).toEqual([]);
  });

  it("shares the win when totals are level", () => {
    const state = makeState({
      hole: 3,
      discard: [makeCard("K")],
      players: [
        makePlayer("a", matching, [0, 1, 2, 3, 4], [3, 4]),
        makePlayer("b", alsoMatching, [0], [3, 1]),
      ],
    });
    const { events } = run(state, [
      ["a", { type: "flip", slot: 5 }],
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 0 }],
    ]);
    // a totals 7. b totals 4 + 9 = 13, so a wins alone; make b level instead:
    expect(events.at(-1)).toMatchObject({ type: "gameOver", winnerIds: ["a"] });

    const level = makeState({
      hole: 3,
      discard: [makeCard("K")],
      players: [
        makePlayer("a", matching, [0, 1, 2, 3, 4], [9, 0]),
        makePlayer("b", alsoMatching, [0], [0, 0]),
      ],
    });
    const result = run(level, [
      ["a", { type: "flip", slot: 5 }],
      ["b", { type: "drawFromDiscard" }],
      ["b", { type: "swapDrawn", slot: 0 }],
    ]);
    // a: 9 + 0 + 0 = 9. b: 0 + 0 + 9 = 9.
    expect(result.events.at(-1)).toEqual({
      type: "gameOver",
      winnerIds: ["a", "b"],
    });
  });
});

describe("starting the next hole", () => {
  const holeOver = (dealerIndex: number) =>
    deepFreeze(
      makeState({
        hole: 1,
        dealerIndex,
        phase: { type: "holeOver" },
        finalTurnTriggeredBy: "a",
        players: [
          makePlayer("a", ["A", "A", "A", "A", "A", "A"], ALL_FACE_UP, [7]),
          makePlayer("b", ["A", "A", "A", "A", "A", "A"], ALL_FACE_UP, [3]),
          makePlayer("c", ["A", "A", "A", "A", "A", "A"], ALL_FACE_UP, [11]),
        ],
      }),
    );

  it("passes the deal one seat to the left and deals fresh cards", () => {
    const { state: next, events } = run(holeOver(0), [
      ["c", { type: "startNextHole" }],
    ]);

    expect(next.hole).toBe(2);
    expect(next.dealerIndex).toBe(1);
    expect(next.phase).toEqual({
      type: "initialFlip",
      flipsRequired: 2,
      contenders: ["a", "b", "c"],
    });
    expect(next.finalTurnTriggeredBy).toBeNull();
    expect(events).toEqual([{ type: "holeStarted", hole: 2, dealerId: "b" }]);
    expect(next.players.map((p) => p.holeScores)).toEqual([[7], [3], [11]]);
    for (const p of next.players) {
      expect(p.grid.every((g) => !g.faceUp)).toBe(true);
    }
    const ids = allCardIds(next);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });

  it("wraps the dealer back to the first seat", () => {
    const { state: next } = run(holeOver(2), [
      ["a", { type: "startNextHole" }],
    ]);
    expect(next.dealerIndex).toBe(0);
  });

  it("deals starting with the player to the new dealer's left", () => {
    const seed = 21;
    const shuffled = shuffle(buildDeck(), createSeededRng(seed));
    const { state: next } = run(
      holeOver(0),
      [["a", { type: "startNextHole" }]],
      seed,
    );
    // Seat 1 deals, so seat 2 (c) gets the first card.
    expect(player(next, "c").grid[0].card).toEqual(shuffled[51]);
    expect(player(next, "a").grid[0].card).toEqual(shuffled[50]);
    expect(player(next, "b").grid[0].card).toEqual(shuffled[49]);
  });

  it("does not start a hole in the middle of play", () => {
    const state = makeState({
      players: [
        makePlayer("a", ["A", "A", "A", "A", "A", "A"]),
        makePlayer("b", ["A", "A", "A", "A", "A", "A"]),
      ],
    });
    expect(
      applyAction(state, "a", { type: "startNextHole" }, createSeededRng(1)),
    ).toEqual({ ok: false, error: "WRONG_PHASE" });
  });
});
