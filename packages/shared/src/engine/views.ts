// What one player is allowed to see of the game. The server sends this instead of
// GameState, which contains the whole deck and every face-down card.
import type { Action } from "./actions";
import type { Card } from "./cards";
import type { GameSettings } from "./settings";
import { getLegalActions } from "./rules";
import type { DrawSource, GameState, Phase, PlayerId, Tuple6 } from "./state";

/** A face-down slot carries no card at all, not even an id, so nothing can leak. */
export type SlotView =
  { readonly faceUp: true; readonly card: Card } | { readonly faceUp: false };

export interface PlayerView {
  readonly id: PlayerId;
  readonly grid: Tuple6<SlotView>;
  readonly holeScores: readonly number[];
}

/**
 * Same as Phase, except for `place`. A card drawn from the discard pile is public.
 * A card drawn from the draw pile is only visible to the player holding it, so
 * everyone else gets `drawn: null`.
 */
export type PhaseView =
  | Exclude<Phase, { type: "place" }>
  | {
      readonly type: "place";
      readonly source: DrawSource;
      readonly drawn: Card | null;
    };

export interface GameView {
  /** Who this view is for. `null` for spectators. */
  readonly viewerId: PlayerId | null;
  readonly settings: GameSettings;
  readonly hole: number;
  readonly dealerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly finalTurnTriggeredBy: PlayerId | null;
  /** Players in seating order. Turns pass towards higher indexes, wrapping around. */
  readonly players: readonly PlayerView[];
  readonly deckCount: number;
  readonly discardTop: Card | null;
  readonly discardCount: number;
  readonly phase: PhaseView;
  /** Everything the viewer may do right now. Empty for spectators. */
  readonly legalActions: readonly Action[];
}

/**
 * Build the view of `state` for `viewerId`. Pass `null` (or an id that is not
 * seated) to get the spectator view, which reveals nothing private.
 *
 * The result is plain JSON and shares no mutable data with `state`.
 */
export function getPlayerView(
  state: GameState,
  viewerId: PlayerId | null,
): GameView {
  const viewer =
    viewerId !== null && state.players.some((p) => p.id === viewerId)
      ? viewerId
      : null;

  const dealer = state.players[state.dealerIndex];
  const current = state.players[state.currentPlayerIndex];
  if (dealer === undefined || current === undefined) {
    throw new Error("Engine invariant violated: seat index out of range");
  }

  return {
    viewerId: viewer,
    settings: state.settings,
    hole: state.hole,
    dealerId: dealer.id,
    currentPlayerId: current.id,
    finalTurnTriggeredBy: state.finalTurnTriggeredBy,
    players: state.players.map((p) => ({
      id: p.id,
      grid: p.grid.map((slot) =>
        slot.faceUp ? { faceUp: true, card: slot.card } : { faceUp: false },
      ) as unknown as Tuple6<SlotView>,
      holeScores: p.holeScores,
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.at(-1) ?? null,
    discardCount: state.discard.length,
    phase: phaseView(state, current.id, viewer),
    legalActions: viewer === null ? [] : getLegalActions(state, viewer),
  };
}

function phaseView(
  state: GameState,
  currentId: PlayerId,
  viewer: PlayerId | null,
): PhaseView {
  const { phase } = state;
  if (phase.type !== "place") return phase;
  const visible = phase.source === "discard" || viewer === currentId;
  return {
    type: "place",
    source: phase.source,
    drawn: visible ? phase.drawn : null,
  };
}
