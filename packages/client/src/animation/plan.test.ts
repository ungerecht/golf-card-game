import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyAction,
  createGame,
  createSeededRng,
  getPlayerView,
  type Action,
  type GameEvent,
  type GameState,
  type GameView,
  type PlayerId,
} from "@golf/shared";
import { NO_PLAN, anchorKey, planUpdate, type Move } from "./plan";

const IDS = ["p1", "p2", "p3"];

/** A game where it is p1's turn and nobody has anything face up. */
function midGame(): GameState {
  const game = createGame(DEFAULT_SETTINGS, IDS, createSeededRng(7));
  return {
    ...game,
    dealerIndex: 2,
    currentPlayerIndex: 0,
    phase: { type: "flipOrDraw" },
  };
}

/** Play `actions` and plan the last one, as `viewer` saw it. */
function planFor(
  start: GameState,
  viewer: PlayerId | null,
  who: PlayerId,
  ...actions: Action[]
) {
  let state = start;
  let prev: GameView = getPlayerView(state, viewer);
  let events: readonly GameEvent[] = [];
  for (const action of actions) {
    prev = getPlayerView(state, viewer);
    const result = applyAction(state, who, action, createSeededRng(1));
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    events = result.events;
  }
  return planUpdate(prev, { view: getPlayerView(state, viewer), events });
}

const moves = (plan: ReturnType<typeof planFor>): Move[] =>
  plan.steps.flatMap((s) => (s.type === "moves" ? [...s.moves] : []));
const keys = (move: Move) => [anchorKey(move.from), anchorKey(move.to)];

describe("planUpdate", () => {
  it("does nothing for a refresh", () => {
    const view = getPlayerView(midGame(), "p1");
    expect(planUpdate(view, { view, events: [] })).toBe(NO_PLAN);
  });

  it("shuffles, then deals one card at a time starting left of the dealer", () => {
    const state = midGame();
    const view = getPlayerView(state, "p1");
    const plan = planUpdate(null, {
      view,
      events: [{ type: "holeStarted", hole: 1, dealerId: "p3" }],
    });

    expect(plan.steps[0]).toEqual({ type: "shuffle" });
    const [, deal, starter] = plan.steps;
    const dealt = deal?.type === "moves" ? deal.moves : [];
    expect(dealt).toHaveLength(18);
    // Dealer is p3, so p1 gets the first card, then p2, then the dealer.
    expect(dealt.slice(0, 4).map((m) => anchorKey(m.to))).toEqual([
      "slot:p1:0",
      "slot:p2:0",
      "slot:p3:0",
      "slot:p1:1",
    ]);
    expect(dealt.every((m) => anchorKey(m.from) === "deck")).toBe(true);
    expect(dealt.every((m) => m.face === "back" && !m.flipTo)).toBe(true);
    const delays = dealt.map((m) => m.delay);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(18);

    // The starter card comes off the deck and turns over on the discard pile.
    const turned = starter?.type === "moves" ? starter.moves[0] : undefined;
    expect(turned && keys(turned)).toEqual(["deck", "discard"]);
    expect(turned?.flipTo).toEqual(view.discardTop);
  });

  it("holds back every card, the discard pile and the deck count while dealing", () => {
    const view = getPlayerView(midGame(), "p1");
    const { hold } = planUpdate(null, {
      view,
      events: [{ type: "holeStarted", hole: 1, dealerId: "p3" }],
    });
    expect(hold.anchors.size).toBe(18);
    expect(hold.anchors.has("slot:p2:5")).toBe(true);
    expect(hold.discard).toBe("empty");
    expect(hold.deckExtra).toBe(19);
  });

  it("keeps a big table's deal short", () => {
    const ids = ["a", "b", "c", "d"];
    const game = createGame(
      { ...DEFAULT_SETTINGS, maxPlayers: 4 },
      ids,
      createSeededRng(3),
    );
    const plan = planUpdate(null, {
      view: getPlayerView(game, "a"),
      events: [{ type: "holeStarted", hole: 1, dealerId: "a" }],
    });
    const last = moves(plan)
      .filter((m) => m.flight > 0 && m.delay > 0)
      .at(-1);
    expect(last?.delay ?? Infinity).toBeLessThanOrEqual(1400);
  });

  it("turns a flipped card over in place", () => {
    const plan = planFor(midGame(), "p2", "p1", { type: "flip", slot: 4 });
    const [move] = moves(plan);
    expect(moves(plan)).toHaveLength(1);
    expect(move && keys(move)).toEqual(["slot:p1:4", "slot:p1:4"]);
    expect(move?.face).toBe("back");
    expect(move?.flipTo).toBeDefined();
    expect(move?.flight).toBe(0);
    expect([...plan.hold.anchors]).toEqual(["slot:p1:4"]);
  });

  it("shows you your own card turning over after you draw it", () => {
    const plan = planFor(midGame(), "p1", "p1", { type: "drawFromDeck" });
    const [move] = moves(plan);
    expect(move && keys(move)).toEqual(["deck", "held:p1:deck"]);
    expect(move?.face).toBe("back");
    expect(move?.flipTo).toBeDefined();
    expect(plan.hold.deckExtra).toBe(1);
  });

  it("never turns over a card someone else drew", () => {
    const plan = planFor(midGame(), "p2", "p1", { type: "drawFromDeck" });
    const [move] = moves(plan);
    expect(move && keys(move)).toEqual(["deck", "held:p1:deck"]);
    expect(move?.face).toBe("back");
    expect(move?.flipTo).toBeUndefined();
  });

  it("shows the face of a card taken from the discard pile, to everyone", () => {
    for (const viewer of ["p1", "p2", null]) {
      const state = midGame();
      const plan = planFor(state, viewer, "p1", { type: "drawFromDiscard" });
      const [move] = moves(plan);
      expect(move && keys(move)).toEqual(["discard", "held:p1:discard"]);
      expect(move?.face).toEqual(state.discard.at(-1));
      expect(move?.flipTo).toBeUndefined();
    }
  });

  it("turns over a card placed face down by someone else, and the one it replaces", () => {
    const plan = planFor(
      midGame(),
      "p2",
      "p1",
      { type: "drawFromDeck" },
      { type: "swapDrawn", slot: 2 },
    );
    const [place, replace] = moves(plan);
    expect(place && keys(place)).toEqual(["held:p1:deck", "slot:p1:2"]);
    expect(place?.face).toBe("back");
    expect(place?.flipTo).toBeDefined();
    expect(replace && keys(replace)).toEqual(["slot:p1:2", "discard"]);
    // Nobody had seen it, so it flips as it reaches the discard pile.
    expect(replace?.face).toBe("back");
    expect(replace?.flipTo).toBeDefined();
    // The replaced card moves only once the placed one is down.
    expect(plan.steps.map((s) => s.type)).toEqual(["moves", "moves"]);
  });

  it("does not turn over a card you drew yourself", () => {
    const plan = planFor(
      midGame(),
      "p1",
      "p1",
      { type: "drawFromDeck" },
      { type: "swapDrawn", slot: 2 },
    );
    expect(moves(plan)[0]?.face).not.toBe("back");
    expect(moves(plan)[0]?.flipTo).toBeUndefined();
  });

  it("does not turn over a replaced card that was already face up", () => {
    const base = midGame();
    const grid = base.players[0]!.grid.map((g, i) =>
      i === 2 ? { ...g, faceUp: true } : g,
    ) as unknown as GameState["players"][number]["grid"];
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, grid } : p)),
    };
    const plan = planFor(
      state,
      "p2",
      "p1",
      { type: "drawFromDiscard" },
      { type: "swapDrawn", slot: 2 },
    );
    const [place, replace] = moves(plan);
    expect(place && keys(place)).toEqual(["held:p1:discard", "slot:p1:2"]);
    expect(place?.flipTo).toBeUndefined();
    expect(replace?.face).not.toBe("back");
    expect(replace?.flipTo).toBeUndefined();
  });

  it("keeps showing the old discard top until the replaced card lands", () => {
    const state = midGame();
    const plan = planFor(
      state,
      "p2",
      "p1",
      { type: "drawFromDeck" },
      { type: "swapDrawn", slot: 0 },
    );
    expect(plan.hold.discard).toEqual(state.discard.at(-1));
    expect(plan.hold.anchors.has("slot:p1:0")).toBe(true);
  });

  it("sends a discarded card to the pile, turning it over if it was unseen", () => {
    const seen = planFor(
      midGame(),
      "p1",
      "p1",
      { type: "drawFromDeck" },
      { type: "discardDrawn" },
    );
    expect(moves(seen)[0]?.flipTo).toBeUndefined();
    expect(keys(moves(seen)[0]!)).toEqual(["held:p1:deck", "discard"]);

    const unseen = planFor(
      midGame(),
      "p2",
      "p1",
      { type: "drawFromDeck" },
      { type: "discardDrawn" },
    );
    expect(moves(unseen)[0]?.face).toBe("back");
    expect(moves(unseen)[0]?.flipTo).toBeDefined();
  });

  it("turns over everyone's last cards together when someone goes out", () => {
    const base = midGame();
    const grid = base.players[0]!.grid.map((g, i) =>
      i === 0 ? g : { ...g, faceUp: true },
    ) as unknown as GameState["players"][number]["grid"];
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, grid } : p)),
    };
    const plan = planFor(state, "p2", "p1", { type: "flip", slot: 0 });
    const flips = moves(plan);
    // Their own card, then all twelve face-down cards of the other two.
    expect(flips).toHaveLength(13);
    expect(
      flips.slice(1).every((m) => m.from === m.to || keys(m)[0] === keys(m)[1]),
    ).toBe(true);
    expect(flips.slice(1).every((m) => m.flipTo !== undefined)).toBe(true);
    // The reveal is one step, so the cards turn together, a little apart.
    expect(plan.steps).toHaveLength(2);
    const delays = flips.slice(1).map((m) => m.delay);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeGreaterThan(0);
  });

  it("shuffles when the draw pile runs out, then draws", () => {
    const state: GameState = {
      ...midGame(),
      deck: [],
      discard: [
        { id: "a", rank: "5", suit: "clubs" } as never,
        { id: "b", rank: "6", suit: "clubs" } as never,
        { id: "c", rank: "7", suit: "clubs" } as never,
      ],
    };
    const plan = planFor(state, "p2", "p1", { type: "drawFromDeck" });
    expect(plan.steps.map((s) => s.type)).toEqual(["shuffle", "moves"]);
  });

  it("has no animation for events that need none", () => {
    const view = getPlayerView(midGame(), "p1");
    const plan = planUpdate(view, {
      view,
      events: [
        { type: "turnStarted", playerId: "p2" },
        { type: "holeScored", scores: {} },
      ],
    });
    expect(plan).toBe(NO_PLAN);
  });
});
