// Helpers for tests only. Not exported from the package.
import type { Card, Rank, Suit } from "./cards";
import type { GameEvent } from "./events";
import type { ApplyResult } from "./reducer";
import { DEFAULT_SETTINGS } from "./settings";
import type { GameState, Grid, PlayerState, Tuple6 } from "./state";

let cardCounter = 0;

/** A card with an id that is unique across the whole test run. */
export function makeCard(rank: Rank, suit: Suit = "spades"): Card {
  cardCounter += 1;
  return { id: `t${cardCounter}-${rank}-${suit}`, rank, suit };
}

export const ALL_FACE_UP = [0, 1, 2, 3, 4, 5] as const;

/**
 * Build a grid from six ranks, laid out row by row:
 *
 *   slot 0  slot 1  slot 2
 *   slot 3  slot 4  slot 5
 *
 * `faceUp` lists which slots are face up. The default is none.
 */
export function makeGrid(
  ranks: Tuple6<Rank>,
  faceUp: readonly number[] = [],
): Grid {
  return ranks.map((rank, slot) => ({
    card: makeCard(rank),
    faceUp: faceUp.includes(slot),
  })) as unknown as Grid;
}

export function makePlayer(
  id: string,
  ranks: Tuple6<Rank>,
  faceUp: readonly number[] = [],
  holeScores: number[] = [],
): PlayerState {
  return { id, grid: makeGrid(ranks, faceUp), holeScores };
}

/** A game with sensible defaults. Override whatever the test cares about. */
export function makeState(
  overrides: Partial<GameState> & Pick<GameState, "players">,
): GameState {
  return {
    settings: { ...DEFAULT_SETTINGS, holes: 3 },
    deck: [],
    discard: [makeCard("5")],
    hole: 1,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    phase: { type: "flipOrDraw" },
    finalTurnTriggeredBy: null,
    ...overrides,
  };
}

/** Unwrap a successful result, or fail the test with the error. */
export function expectOk(result: ApplyResult): {
  state: GameState;
  events: readonly GameEvent[];
} {
  if (!result.ok) {
    throw new Error(`Expected the action to succeed, got ${result.error}`);
  }
  return { state: result.state, events: result.events };
}

export function player(state: GameState, id: string): PlayerState {
  const found = state.players.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No player ${id}`);
  return found;
}

/** Freeze a value and everything inside it, so any accidental mutation throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Every card id in the game: both piles, every grid, and a card being held. */
export function allCardIds(state: GameState): string[] {
  const ids = [
    ...state.deck.map((card) => card.id),
    ...state.discard.map((card) => card.id),
    ...state.players.flatMap((p) => p.grid.map((gridCard) => gridCard.card.id)),
  ];
  if (state.phase.type === "place") ids.push(state.phase.drawn.id);
  return ids;
}
