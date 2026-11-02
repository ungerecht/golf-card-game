import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  getPlayerView,
  type Action,
  type GameState,
} from "@golf/shared";
import { clickTargets, describeAction } from "./targets";

const base = (): GameState =>
  createGame(DEFAULT_SETTINGS, ["a", "b"], () => 0.5);

const slotsOf = (state: GameState, id: string) => [
  ...clickTargets(getPlayerView(state, id)).slots.keys(),
];

describe("clickTargets", () => {
  it("lets you flip any card during the first flips, and nothing else", () => {
    const t = clickTargets(getPlayerView(base(), "a"));
    expect([...t.slots.keys()]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(t.slots.get(2)).toEqual({ type: "flipInitial", slot: 2 });
    expect(t.draw).toBeNull();
    expect(t.discard).toBeNull();
  });

  it("offers the face-down cards and both piles on your turn", () => {
    const state: GameState = {
      ...base(),
      phase: { type: "flipOrDraw" },
      currentPlayerIndex: 0,
    };
    const t = clickTargets(getPlayerView(state, "a"));
    expect(t.draw).toEqual({ type: "drawFromDeck" });
    expect(t.discard).toEqual({ type: "drawFromDiscard" });
    expect(t.slots.get(0)).toEqual({ type: "flip", slot: 0 });
  });

  it("offers nothing when it is not your turn", () => {
    const state: GameState = {
      ...base(),
      phase: { type: "flipOrDraw" },
      currentPlayerIndex: 1,
    };
    const t = clickTargets(getPlayerView(state, "a"));
    expect(t.slots.size).toBe(0);
    expect(t.draw).toBeNull();
    expect(t.discard).toBeNull();
    expect(slotsOf(state, "b")).toHaveLength(6);
  });

  it("offers a swap into any card, and a discard only for a card from the deck", () => {
    const start = base();
    const drawn = start.deck.at(-1)!;
    const place = (source: "deck" | "discard"): GameState => ({
      ...start,
      currentPlayerIndex: 0,
      phase: { type: "place", drawn, source },
    });

    const fromDeck = clickTargets(getPlayerView(place("deck"), "a"));
    expect(fromDeck.slots.get(4)).toEqual({ type: "swapDrawn", slot: 4 });
    expect(fromDeck.slots.size).toBe(6);
    expect(fromDeck.discard).toEqual({ type: "discardDrawn" });
    expect(fromDeck.draw).toBeNull();

    const fromDiscard = clickTargets(getPlayerView(place("discard"), "a"));
    expect(fromDiscard.slots.size).toBe(6);
    expect(fromDiscard.discard).toBeNull();
  });

  it("offers nothing to a spectator", () => {
    const t = clickTargets(getPlayerView(base(), null));
    expect(t.slots.size).toBe(0);
    expect(t.draw).toBeNull();
  });
});

describe("describeAction", () => {
  it("gives every action its own wording", () => {
    const actions: Action[] = [
      { type: "flipInitial", slot: 0 },
      { type: "flip", slot: 5 },
      { type: "swapDrawn", slot: 3 },
      { type: "drawFromDeck" },
      { type: "drawFromDiscard" },
      { type: "discardDrawn" },
      { type: "startNextHole" },
    ];
    const words = actions.map(describeAction);
    expect(new Set(words).size).toBe(actions.length);
    expect(describeAction({ type: "flip", slot: 5 })).toBe(
      "Flip your bottom right card",
    );
  });
});
