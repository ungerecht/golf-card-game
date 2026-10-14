import type { Action } from "./actions";
import { faceUpCount, isFullyFaceUp } from "./grid";
import { invariant } from "./invariant";
import {
  SLOT_INDEXES,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "./state";

/** Why an action was rejected. */
export type ActionError =
  /** The sender is not seated in this game. */
  | "NOT_A_PLAYER"
  /** The game is not waiting for this kind of action right now. */
  | "WRONG_PHASE"
  /** Only the current player may take this action. */
  | "NOT_YOUR_TURN"
  /** Initial flip: you already have all the cards face up that this round asks for. */
  | "ALREADY_FLIPPED_ENOUGH"
  /** That slot is already face up. */
  | "SLOT_FACE_UP"
  /** Flip: every card in your grid is already face up, so there is nothing to flip. */
  | "NO_FACE_DOWN_CARD"
  /** Draw pile: it is empty and there is nothing to reshuffle into it. */
  | "DECK_EMPTY"
  /** A card taken from the discard pile must be swapped into your grid. */
  | "MUST_SWAP";

export function findPlayer(
  state: GameState,
  playerId: PlayerId,
): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = findPlayer(state, playerId);
  invariant(player !== undefined, `unknown player ${playerId}`);
  return player;
}

export function getCurrentPlayer(state: GameState): PlayerState {
  const player = state.players[state.currentPlayerIndex];
  invariant(player !== undefined, "currentPlayerIndex is out of range");
  return player;
}

/** The draw pile can supply a card, either directly or by reshuffling the discard pile. */
function canDrawFromDeck(state: GameState): boolean {
  return state.deck.length > 0 || state.discard.length > 1;
}

/**
 * Check whether `playerId` may take `action` right now. Returns the reason if
 * not, or `null` if it is allowed. This is the single place that decides what
 * is legal: the reducer uses it to reject cheating, and `getLegalActions`
 * uses it so the UI and bots always agree with the server.
 */
export function validateAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
): ActionError | null {
  const player = findPlayer(state, playerId);
  if (player === undefined) return "NOT_A_PLAYER";

  const { phase } = state;
  const isCurrent = getCurrentPlayer(state).id === playerId;

  switch (action.type) {
    case "flipInitial":
      if (phase.type !== "initialFlip") return "WRONG_PHASE";
      if (faceUpCount(player.grid) >= phase.flipsRequired) {
        return "ALREADY_FLIPPED_ENOUGH";
      }
      if (player.grid[action.slot].faceUp) return "SLOT_FACE_UP";
      return null;

    case "flip":
      if (phase.type !== "flipOrDraw") return "WRONG_PHASE";
      if (!isCurrent) return "NOT_YOUR_TURN";
      // Covers the final turns after someone goes out, and the rare case where
      // every card is face up before the first turn.
      if (isFullyFaceUp(player.grid)) return "NO_FACE_DOWN_CARD";
      if (player.grid[action.slot].faceUp) return "SLOT_FACE_UP";
      return null;

    case "drawFromDeck":
      if (phase.type !== "flipOrDraw") return "WRONG_PHASE";
      if (!isCurrent) return "NOT_YOUR_TURN";
      if (!canDrawFromDeck(state)) return "DECK_EMPTY";
      return null;

    case "drawFromDiscard":
      if (phase.type !== "flipOrDraw") return "WRONG_PHASE";
      if (!isCurrent) return "NOT_YOUR_TURN";
      return null;

    case "swapDrawn":
      if (phase.type !== "place") return "WRONG_PHASE";
      if (!isCurrent) return "NOT_YOUR_TURN";
      return null;

    case "discardDrawn":
      if (phase.type !== "place") return "WRONG_PHASE";
      if (!isCurrent) return "NOT_YOUR_TURN";
      if (phase.source === "discard") return "MUST_SWAP";
      return null;

    case "startNextHole":
      if (phase.type !== "holeOver") return "WRONG_PHASE";
      return null;
  }
}

/** Every action the schema allows, with every slot. Candidates for `getLegalActions`. */
export const ALL_ACTIONS: readonly Action[] = [
  ...SLOT_INDEXES.map((slot): Action => ({ type: "flipInitial", slot })),
  ...SLOT_INDEXES.map((slot): Action => ({ type: "flip", slot })),
  { type: "drawFromDeck" },
  { type: "drawFromDiscard" },
  ...SLOT_INDEXES.map((slot): Action => ({ type: "swapDrawn", slot })),
  { type: "discardDrawn" },
  { type: "startNextHole" },
];

/**
 * Every action `playerId` could take right now, with concrete slots. Use it to
 * enable or hide buttons in the UI and to let bots choose a move. An empty list
 * means the player has to wait.
 */
export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): Action[] {
  return ALL_ACTIONS.filter(
    (action) => validateAction(state, playerId, action) === null,
  );
}
