import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { chooseAction, type BotLevel } from "./bots";
import { applyAction } from "./reducer";
import { createSeededRng } from "./rng";
import { getLegalActions } from "./rules";
import { totalScore } from "./scoring";
import { DEFAULT_SETTINGS } from "./settings";
import { createGame } from "./setup";
import type { GameState } from "./state";
import { getPlayerView } from "./views";
import { makeCard, makePlayer, makeState } from "./test-helpers";

const rng = () => createSeededRng(1);

// Columns: (slot 0, slot 3), (slot 1, slot 4), (slot 2, slot 5).
const ranks = ["9", "8", "7", "6", "5", "4"] as const;

describe("chooseAction", () => {
  it("returns null when it is not the bot's turn, and between and after holes", () => {
    const state = makeState({
      players: [makePlayer("a", ranks, [0]), makePlayer("bot", ranks, [0])],
    });
    expect(chooseAction(getPlayerView(state, "bot"), rng())).toBeNull();
    expect(chooseAction(getPlayerView(state, null), rng())).toBeNull();

    const over = { ...state, phase: { type: "holeOver" } } as GameState;
    expect(chooseAction(getPlayerView(over, "bot"), rng())).toBeNull();
    const done = { ...state, phase: { type: "gameOver" } } as GameState;
    expect(chooseAction(getPlayerView(done, "bot"), rng())).toBeNull();
  });

  it("flips in the initial flip, and stops once it has flipped enough", () => {
    const state = makeState({
      phase: {
        type: "initialFlip",
        flipsRequired: 2,
        contenders: ["bot", "a"],
      },
      players: [makePlayer("bot", ranks, [0]), makePlayer("a", ranks)],
    });
    const action = chooseAction(getPlayerView(state, "bot"), rng());
    expect(action).toMatchObject({ type: "flipInitial" });

    const enough = makeState({
      phase: {
        type: "initialFlip",
        flipsRequired: 2,
        contenders: ["bot", "a"],
      },
      players: [makePlayer("bot", ranks, [0, 1]), makePlayer("a", ranks)],
    });
    expect(chooseAction(getPlayerView(enough, "bot"), rng())).toBeNull();
  });

  describe("normal bot on its turn", () => {
    const turn = (discardTop: ReturnType<typeof makeCard>, faceUp: number[]) =>
      getPlayerView(
        makeState({
          deck: [makeCard("9")],
          discard: [makeCard("3"), discardTop],
          players: [makePlayer("bot", ranks, faceUp), makePlayer("a", ranks)],
          currentPlayerIndex: 0,
        }),
        "bot",
      );

    it("takes a low discard", () => {
      expect(chooseAction(turn(makeCard("K"), [0, 1]), rng())).toEqual({
        type: "drawFromDiscard",
      });
    });

    it("takes a discard that completes a column", () => {
      // Slot 3 holds a 6. Another 6 in slot 0 would cancel the column.
      expect(chooseAction(turn(makeCard("6"), [0, 3]), rng())).toEqual({
        type: "drawFromDiscard",
      });
    });

    it("draws from the deck when the discard is no help", () => {
      expect(chooseAction(turn(makeCard("Q"), [0, 1]), rng())).toEqual({
        type: "drawFromDeck",
      });
    });

    it("flips a card when the deck cannot be drawn from and the discard is no help", () => {
      const view = getPlayerView(
        makeState({
          deck: [],
          discard: [makeCard("Q")],
          players: [makePlayer("bot", ranks, [0, 1]), makePlayer("a", ranks)],
        }),
        "bot",
      );
      expect(chooseAction(view, rng())).toMatchObject({ type: "flip" });
    });
  });

  describe("normal bot holding a card", () => {
    const holding = (
      drawn: ReturnType<typeof makeCard>,
      source: "deck" | "discard",
      faceUp: number[],
    ) =>
      getPlayerView(
        makeState({
          phase: { type: "place", drawn, source },
          players: [makePlayer("bot", ranks, faceUp), makePlayer("a", ranks)],
        }),
        "bot",
      );

    it("puts a low card over its worst card", () => {
      // The highest face-up card is the 9 at slot 0.
      expect(
        chooseAction(holding(makeCard("K"), "deck", [0, 1, 2]), rng()),
      ).toEqual({
        type: "swapDrawn",
        slot: 0,
      });
    });

    it("matches a column when it can", () => {
      // Slot 3 is a face-up 6, so a 6 belongs at slot 0 (on the 9).
      expect(
        chooseAction(holding(makeCard("6"), "deck", [0, 3]), rng()),
      ).toEqual({
        type: "swapDrawn",
        slot: 0,
      });
    });

    it("discards a card from the deck that does not help", () => {
      expect(
        chooseAction(holding(makeCard("Q"), "deck", [0, 1, 2, 3, 4, 5]), rng()),
      ).toEqual({
        type: "discardDrawn",
      });
    });

    it("must swap a card taken from the discard pile, and picks its least bad slot", () => {
      const action = chooseAction(
        holding(makeCard("Q"), "discard", [0, 1, 2, 3, 4, 5]),
        rng(),
      );
      // Q is 12. It costs least to cover the 9 at slot 0 (+3), not the 4 at slot 5 (+8).
      expect(action).toEqual({ type: "swapDrawn", slot: 0 });
    });
  });

  it("never reads anything that the view hides", () => {
    // Two states that differ only in hidden cards must give the same answer.
    const make = (deckCard: string, hidden: string) =>
      makeState({
        deck: [makeCard(deckCard as "2")],
        players: [
          makePlayer("bot", [hidden as "2", "8", "7", "6", "5", "4"], [1, 2]),
          makePlayer("a", ranks),
        ],
      });
    const one = chooseAction(getPlayerView(make("2", "K"), "bot"), rng());
    const two = chooseAction(getPlayerView(make("Q", "A"), "bot"), rng());
    expect(one).toEqual(two);
  });
});

/** Play whole games with the given bot levels, starting each hole as the host would. */
function playGame(
  levels: BotLevel[],
  seed: number,
  holes: 3 | 6 | 9 = 3,
): GameState {
  const gameRng = createSeededRng(seed);
  const botRng = createSeededRng(seed + 99);
  const ids = levels.map((_, i) => `bot${i}`);
  let state = createGame({ ...DEFAULT_SETTINGS, holes }, ids, gameRng);

  for (let step = 0; step < 10_000; step += 1) {
    if (state.phase.type === "gameOver") return state;
    let action: Action | null = null;
    let actor = ids[0] as string;
    if (state.phase.type === "holeOver") {
      action = { type: "startNextHole" };
    } else {
      for (const [i, id] of ids.entries()) {
        action = chooseAction(getPlayerView(state, id), botRng, levels[i]);
        if (action !== null) {
          actor = id;
          break;
        }
      }
    }
    if (action === null) throw new Error("bots got stuck");
    expect(getLegalActions(state, actor)).toContainEqual(action);
    const result = applyAction(state, actor, action, gameRng);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  throw new Error("game did not finish");
}

describe("bots playing whole games", () => {
  for (const level of ["easy", "normal"] as const) {
    it(`${level} bots always choose legal actions and finish 2, 3 and 4 player games`, () => {
      for (const count of [2, 3, 4]) {
        for (let seed = 1; seed <= 10; seed += 1) {
          const end = playGame(Array<BotLevel>(count).fill(level), seed, 6);
          expect(end.phase.type).toBe("gameOver");
          expect(end.players.every((p) => p.holeScores.length === 6)).toBe(
            true,
          );
        }
      }
    });
  }

  it("normal bots score clearly better than easy bots", () => {
    let normal = 0;
    let easy = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const end = playGame(["normal", "easy"], seed, 3);
      normal += totalScore(end.players[0] as never);
      easy += totalScore(end.players[1] as never);
    }
    expect(normal).toBeLessThan(easy * 0.8);
  });

  it("is deterministic for a given seed", () => {
    const a = playGame(["normal", "normal", "easy"], 7);
    const b = playGame(["normal", "normal", "easy"], 7);
    expect(a).toEqual(b);
  });
});
