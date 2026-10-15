import { describe, expect, it } from "vitest";
import { applyAction } from "./reducer";
import { createSeededRng } from "./rng";
import { getLegalActions } from "./rules";
import { DEFAULT_SETTINGS } from "./settings";
import { createGame } from "./setup";
import type { GameState } from "./state";
import { getPlayerView } from "./views";
import { deepFreeze, makeCard, makePlayer, makeState } from "./test-helpers";

const ranks = ["2", "3", "4", "5", "6", "7"] as const;

function base() {
  return makeState({
    deck: [makeCard("8"), makeCard("9"), makeCard("10")],
    discard: [makeCard("J"), makeCard("Q"), makeCard("K")],
    dealerIndex: 1,
    currentPlayerIndex: 0,
    players: [makePlayer("a", ranks, [0, 1]), makePlayer("b", ranks, [0])],
  });
}

describe("getPlayerView", () => {
  it("shows face-up cards and hides face-down ones, including your own", () => {
    const state = base();
    const view = getPlayerView(state, "a");
    const a = view.players[0];
    expect(a?.grid[0]).toEqual({
      faceUp: true,
      card: state.players[0]?.grid[0].card,
    });
    expect(a?.grid[2]).toEqual({ faceUp: false });
    expect(Object.keys(a?.grid[2] ?? {})).toEqual(["faceUp"]);
    expect(view.players[1]?.grid[1]).toEqual({ faceUp: false });
  });

  it("reports only the sizes of the piles and the top discard", () => {
    const state = base();
    const view = getPlayerView(state, "b");
    expect(view.deckCount).toBe(3);
    expect(view.discardCount).toBe(3);
    expect(view.discardTop).toEqual(state.discard[2]);
    expect(view).not.toHaveProperty("deck");
    expect(view).not.toHaveProperty("discard");
  });

  it("uses ids instead of seat indexes", () => {
    const view = getPlayerView(base(), "a");
    expect(view.dealerId).toBe("b");
    expect(view.currentPlayerId).toBe("a");
    expect(view.viewerId).toBe("a");
  });

  it("gives each viewer their own legal actions", () => {
    const state = base();
    expect(getPlayerView(state, "a").legalActions).toEqual(
      getLegalActions(state, "a"),
    );
    expect(getPlayerView(state, "b").legalActions).toEqual([]);
  });

  it("treats null and unseated ids as spectators", () => {
    const state = base();
    for (const viewer of [null, "stranger"]) {
      const view = getPlayerView(state, viewer);
      expect(view.viewerId).toBeNull();
      expect(view.legalActions).toEqual([]);
    }
  });

  it("copes with an empty discard pile", () => {
    const state = { ...base(), discard: [] };
    const view = getPlayerView(state, "a");
    expect(view.discardTop).toBeNull();
    expect(view.discardCount).toBe(0);
  });

  describe("a card in hand", () => {
    const held = makeCard("9");
    const place = (source: "deck" | "discard"): GameState => ({
      ...base(),
      phase: { type: "place", drawn: held, source },
    });

    it("from the draw pile is visible only to the player holding it", () => {
      const state = place("deck");
      expect(getPlayerView(state, "a").phase).toEqual({
        type: "place",
        source: "deck",
        drawn: held,
      });
      expect(getPlayerView(state, "b").phase).toEqual({
        type: "place",
        source: "deck",
        drawn: null,
      });
      expect(getPlayerView(state, null).phase).toEqual({
        type: "place",
        source: "deck",
        drawn: null,
      });
    });

    it("from the discard pile is visible to everyone", () => {
      const state = place("discard");
      for (const viewer of ["a", "b", null]) {
        expect(getPlayerView(state, viewer).phase).toEqual({
          type: "place",
          source: "discard",
          drawn: held,
        });
      }
    });
  });

  it("passes the other phases through unchanged", () => {
    const state: GameState = {
      ...base(),
      phase: { type: "initialFlip", flipsRequired: 3, contenders: ["a", "b"] },
    };
    expect(getPlayerView(state, "a").phase).toEqual(state.phase);
  });

  it("does not change the state it is given", () => {
    const state = deepFreeze(base());
    const snapshot = JSON.stringify(state);
    getPlayerView(state, "a");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("nothing hidden ever reaches a viewer", () => {
  /** Ids of every card this viewer must not be able to learn at this point. */
  function hiddenIds(state: GameState, viewer: string | null): string[] {
    const ids = [
      ...state.deck.map((c) => c.id),
      ...state.discard.slice(0, -1).map((c) => c.id),
      ...state.players.flatMap((p) =>
        p.grid.filter((s) => !s.faceUp).map((s) => s.card.id),
      ),
    ];
    const current = state.players[state.currentPlayerIndex];
    if (
      state.phase.type === "place" &&
      state.phase.source === "deck" &&
      current?.id !== viewer
    ) {
      ids.push(state.phase.drawn.id);
    }
    return ids;
  }

  for (const playerCount of [2, 3, 4]) {
    it(`holds across random games with ${playerCount} players`, () => {
      for (let seed = 1; seed <= 8; seed += 1) {
        const rng = createSeededRng(seed);
        const picker = createSeededRng(seed + 500);
        const ids = Array.from({ length: playerCount }, (_, i) => `p${i}`);
        let state = createGame({ ...DEFAULT_SETTINGS, holes: 3 }, ids, rng);

        for (
          let step = 0;
          step < 5000 && state.phase.type !== "gameOver";
          step += 1
        ) {
          const options = ids.flatMap((id) =>
            getLegalActions(state, id).map((action) => ({ id, action })),
          );
          const choice = options[Math.floor(picker() * options.length)];
          if (choice === undefined) throw new Error("no options");
          const result = applyAction(state, choice.id, choice.action, rng);
          if (!result.ok) throw new Error(result.error);
          state = result.state;

          for (const viewer of [...ids, null]) {
            const json = JSON.stringify({
              view: getPlayerView(state, viewer),
              events: result.events,
            });
            for (const hidden of hiddenIds(state, viewer)) {
              expect(json).not.toContain(`"${hidden}"`);
            }
          }
        }
        expect(state.phase.type).toBe("gameOver");
      }
    });
  }
});
