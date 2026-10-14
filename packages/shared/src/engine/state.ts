import type { Card } from "./cards";
import type { GameSettings } from "./settings";

export type PlayerId = string;

/** Number of face-up cards each player must flip before the first turn. */
export const INITIAL_FLIPS = 2;

export type Tuple6<T> = readonly [T, T, T, T, T, T];

/**
 * A player's grid is 2 rows of 3 columns, stored row by row:
 *
 *   slot 0  slot 1  slot 2
 *   slot 3  slot 4  slot 5
 *
 * so the columns are (0,3), (1,4) and (2,5).
 */
export const SLOT_INDEXES = [0, 1, 2, 3, 4, 5] as const;
export type SlotIndex = (typeof SLOT_INDEXES)[number];

export const GRID_COLUMNS = [
  [0, 3],
  [1, 4],
  [2, 5],
] as const;

export interface GridCard {
  readonly card: Card;
  readonly faceUp: boolean;
}

export type Grid = Tuple6<GridCard>;

export interface PlayerState {
  readonly id: PlayerId;
  readonly grid: Grid;
  /** Final score of each finished hole, in order. */
  readonly holeScores: readonly number[];
}

export type DrawSource = "deck" | "discard";

/**
 * What the game is waiting for. Each phase allows only certain actions, and
 * the compiler checks that the reducer handles all of them.
 */
export type Phase =
  // Every player flips cards until they each have `flipsRequired` face up, in any order.
  // Whoever shows the lowest score among `contenders` goes first. On a tie,
  // everyone flips one more card and only the tied players stay contenders.
  | {
      readonly type: "initialFlip";
      readonly flipsRequired: number;
      readonly contenders: readonly PlayerId[];
    }
  // The current player can flip a face-down card or draw from the deck or the discard pile.
  | { readonly type: "flipOrDraw" }
  // The current player holds `drawn` and must swap it into their grid. A card drawn from the deck may also be discarded instead.
  | {
      readonly type: "place";
      readonly drawn: Card;
      readonly source: DrawSource;
    }
  // The hole is finished and scored. Waiting for someone to start the next one.
  | { readonly type: "holeOver" }
  | { readonly type: "gameOver" };

export interface GameState {
  readonly settings: GameSettings;
  // Players in seating order. Turns and the deal pass to the left (clockwise),
  // which means towards higher indexes, wrapping around at the end.
  readonly players: readonly PlayerState[];
  // Draw pile. The next card drawn is the last element.
  readonly deck: readonly Card[];
  // Discard pile. The top card is the last element.
  readonly discard: readonly Card[];
  // Current hole, starting at 1.
  readonly hole: number;
  // Index into `players` of the dealer. Cards are dealt starting with the
  // player to the dealer's left. The host deals the first hole, and the deal
  // passes one seat to the left after every hole.
  readonly dealerIndex: number;
  // Index into `players` of whose turn it is.
  readonly currentPlayerIndex: number;
  readonly phase: Phase;

  // Set when a player has turned their last card face up.
  // All player cards become flipped up.
  // Every other player then gets one more turn, and the hole ends when play returns to this player.
  readonly finalTurnTriggeredBy: PlayerId | null;
}
