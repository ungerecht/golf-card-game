import type { Card } from "./cards";
import type { PlayerId, SlotIndex } from "./state";

export interface RevealedCard {
  readonly playerId: PlayerId;
  readonly slot: SlotIndex;
  readonly card: Card;
}

/**
 * Things that happened while applying an action, in order. The client can
 * animate these instead of comparing two states.
 *
 * Every event is safe to show to every player. In particular, `drewFromDeck`
 * does not say which card was drawn: it stays private to the drawing player
 * until they place or discard it, at which point `swapped` or `discarded`
 * makes it public.
 */
export type GameEvent =
  | {
      readonly type: "flipped";
      readonly playerId: PlayerId;
      readonly slot: SlotIndex;
      readonly card: Card;
    }
  | { readonly type: "drewFromDeck"; readonly playerId: PlayerId }
  | {
      readonly type: "drewFromDiscard";
      readonly playerId: PlayerId;
      readonly card: Card;
    }
  | {
      readonly type: "swapped";
      readonly playerId: PlayerId;
      readonly slot: SlotIndex;
      // Now face up in the player's grid.
      readonly placed: Card;
      // Now face up on top of the discard pile.
      readonly replaced: Card;
    }
  | {
      readonly type: "discarded";
      readonly playerId: PlayerId;
      readonly card: Card;
    }
  | { readonly type: "deckReshuffled" }
  // The first-turn flip ended in a tie, so everyone flips another card.
  | { readonly type: "tiebreak"; readonly contenders: readonly PlayerId[] }
  | { readonly type: "firstPlayerChosen"; readonly playerId: PlayerId }
  | {
      readonly type: "wentOut";
      readonly playerId: PlayerId;
      // Cards that were turned face up in the other players' grids.
      readonly revealed: readonly RevealedCard[];
    }
  | { readonly type: "turnStarted"; readonly playerId: PlayerId }
  | {
      readonly type: "holeScored";
      readonly scores: Readonly<Record<PlayerId, number>>;
    }
  | {
      readonly type: "holeStarted";
      readonly hole: number;
      readonly dealerId: PlayerId;
    }
  | { readonly type: "gameOver"; readonly winnerIds: readonly PlayerId[] };
