import type { Action } from "./actions";
import { shuffle } from "./cards";
import type { GameEvent, RevealedCard } from "./events";
import {
  faceDownSlots,
  faceUpCount,
  isFullyFaceUp,
  revealAll,
  setSlot,
} from "./grid";
import { invariant } from "./invariant";
import type { Rng } from "./rng";
import {
  getCurrentPlayer,
  getPlayer,
  validateAction,
  type ActionError,
} from "./rules";
import { getWinnerIds, scoreHole, showingScore } from "./scoring";
import { dealHole, initialFlipPhase } from "./setup";
import {
  SLOT_INDEXES,
  type GameState,
  type PlayerId,
  type PlayerState,
  type SlotIndex,
} from "./state";

export type ApplyResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | { readonly ok: false; readonly error: ActionError };

interface Step {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Apply one player's action to the game.
 *
 * Pure: the input state is never changed, and the new state comes back in the
 * result. Illegal actions return `{ ok: false, error }` and change nothing.
 * `playerId` comes from the server's knowledge of who sent the message, never
 * from the message itself.
 *
 * `rng` is only used when cards are shuffled (dealing the next hole, or
 * reshuffling the discard pile into an empty draw pile).
 */
export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  rng: Rng,
): ApplyResult {
  const error = validateAction(state, playerId, action);
  if (error !== null) return { ok: false, error };

  const step = runAction(state, playerId, action, rng);
  return { ok: true, state: step.state, events: step.events };
}

function runAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  rng: Rng,
): Step {
  switch (action.type) {
    case "flipInitial":
      return flipInitial(state, playerId, action.slot);
    case "flip":
      return flipCard(state, playerId, action.slot);
    case "drawFromDeck":
      return drawFromDeck(state, playerId, rng);
    case "drawFromDiscard":
      return drawFromDiscard(state, playerId);
    case "swapDrawn":
      return swapDrawn(state, playerId, action.slot);
    case "discardDrawn":
      return discardDrawn(state, playerId);
    case "startNextHole":
      return startNextHole(state, rng);
    default: {
      const unreachable: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(unreachable)}`);
    }
  }
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? update(player) : player,
    ),
  };
}

/** Turn one face-down card face up. Returns the new state and the card. */
function flipSlot(
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
): { state: GameState; event: GameEvent } {
  const { card } = getPlayer(state, playerId).grid[slot];
  return {
    state: updatePlayer(state, playerId, (player) => ({
      ...player,
      grid: setSlot(player.grid, slot, { card, faceUp: true }),
    })),
    event: { type: "flipped", playerId, slot, card },
  };
}

// --- Initial flip -----------------------------------------------------------

function flipInitial(
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
): Step {
  const flipped = flipSlot(state, playerId, slot);
  return resolveInitialFlip(flipped.state, [flipped.event]);
}

/** Seat index of the first candidate going left (clockwise) from the dealer. */
function seatClosestToDealersLeft(
  state: GameState,
  candidates: readonly PlayerId[],
): number {
  const count = state.players.length;
  for (let offset = 1; offset <= count; offset++) {
    const seat = (state.dealerIndex + offset) % count;
    const player = state.players[seat];
    if (player !== undefined && candidates.includes(player.id)) return seat;
  }
  throw new Error("Engine invariant violated: no candidate is seated");
}

/**
 * Once everyone has flipped enough cards, decide who goes first: the lowest
 * showing score among the contenders. On a tie everyone flips one more card
 * and only the tied players stay in the running. If every card is face up and
 * the tie remains, the tied player closest to the dealer's left goes first.
 */
function resolveInitialFlip(
  state: GameState,
  events: readonly GameEvent[],
): Step {
  const { phase } = state;
  invariant(phase.type === "initialFlip", "expected the initial flip phase");

  const everyoneReady = state.players.every(
    (player) => faceUpCount(player.grid) >= phase.flipsRequired,
  );
  if (!everyoneReady) return { state, events };

  const contenders = state.players.filter((player) =>
    phase.contenders.includes(player.id),
  );
  const lowest = Math.min(
    ...contenders.map((player) => showingScore(player.grid)),
  );
  const tied = contenders
    .filter((player) => showingScore(player.grid) === lowest)
    .map((player) => player.id);
  const everyCardFaceUp = phase.flipsRequired >= SLOT_INDEXES.length;

  if (tied.length > 1 && !everyCardFaceUp) {
    return {
      state: {
        ...state,
        phase: {
          type: "initialFlip",
          flipsRequired: phase.flipsRequired + 1,
          contenders: tied,
        },
      },
      events: [...events, { type: "tiebreak", contenders: tied }],
    };
  }

  const seat = seatClosestToDealersLeft(state, tied);
  const first = state.players[seat];
  invariant(first !== undefined, "the first player is not seated");
  return {
    state: {
      ...state,
      currentPlayerIndex: seat,
      phase: { type: "flipOrDraw" },
    },
    events: [...events, { type: "firstPlayerChosen", playerId: first.id }],
  };
}

// --- Turns ------------------------------------------------------------------

function flipCard(state: GameState, playerId: PlayerId, slot: SlotIndex): Step {
  const flipped = flipSlot(state, playerId, slot);
  return endTurn(flipped.state, [flipped.event]);
}

function drawFromDeck(state: GameState, playerId: PlayerId, rng: Rng): Step {
  const events: GameEvent[] = [];
  let deck = state.deck;
  let discard = state.discard;

  if (deck.length === 0) {
    // Shuffle the discard pile, except its top card, into a new draw pile.
    const top = discard.at(-1);
    invariant(top !== undefined, "both piles are empty");
    deck = shuffle(discard.slice(0, -1), rng);
    discard = [top];
    events.push({ type: "deckReshuffled" });
  }

  const drawn = deck.at(-1);
  invariant(drawn !== undefined, "the draw pile is empty after reshuffling");
  events.push({ type: "drewFromDeck", playerId });

  return {
    state: {
      ...state,
      deck: deck.slice(0, -1),
      discard,
      phase: { type: "place", drawn, source: "deck" },
    },
    events,
  };
}

function drawFromDiscard(state: GameState, playerId: PlayerId): Step {
  const card = state.discard.at(-1);
  invariant(card !== undefined, "the discard pile is empty");

  return {
    state: {
      ...state,
      discard: state.discard.slice(0, -1),
      phase: { type: "place", drawn: card, source: "discard" },
    },
    events: [{ type: "drewFromDiscard", playerId, card }],
  };
}

function swapDrawn(
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
): Step {
  const { phase } = state;
  invariant(phase.type === "place", "expected the place phase");

  const replaced = getPlayer(state, playerId).grid[slot].card;
  const swapped = updatePlayer(state, playerId, (player) => ({
    ...player,
    grid: setSlot(player.grid, slot, { card: phase.drawn, faceUp: true }),
  }));

  return endTurn({ ...swapped, discard: [...state.discard, replaced] }, [
    { type: "swapped", playerId, slot, placed: phase.drawn, replaced },
  ]);
}

function discardDrawn(state: GameState, playerId: PlayerId): Step {
  const { phase } = state;
  invariant(phase.type === "place", "expected the place phase");

  return endTurn({ ...state, discard: [...state.discard, phase.drawn] }, [
    { type: "discarded", playerId, card: phase.drawn },
  ]);
}

/**
 * Finish the current player's turn. If they now have every card face up and
 * nobody has gone out yet, they go out: everyone else's remaining face-down
 * cards are turned up. Play then continues to the left, and the hole ends
 * when it would come back around to the player who went out.
 */
function endTurn(state: GameState, events: readonly GameEvent[]): Step {
  const player = getCurrentPlayer(state);
  const allEvents = [...events];
  let next = state;

  if (state.finalTurnTriggeredBy === null && isFullyFaceUp(player.grid)) {
    const revealed: RevealedCard[] = [];
    for (const other of state.players) {
      if (other.id === player.id) continue;
      for (const slot of faceDownSlots(other.grid)) {
        revealed.push({
          playerId: other.id,
          slot,
          card: other.grid[slot].card,
        });
      }
    }
    next = {
      ...state,
      finalTurnTriggeredBy: player.id,
      players: state.players.map((other) =>
        other.id === player.id
          ? other
          : { ...other, grid: revealAll(other.grid) },
      ),
    };
    allEvents.push({ type: "wentOut", playerId: player.id, revealed });
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayer = next.players[nextIndex];
  invariant(nextPlayer !== undefined, "the next player is not seated");

  if (next.finalTurnTriggeredBy === nextPlayer.id) {
    return finishHole(next, allEvents);
  }

  return {
    state: {
      ...next,
      currentPlayerIndex: nextIndex,
      phase: { type: "flipOrDraw" },
    },
    events: [...allEvents, { type: "turnStarted", playerId: nextPlayer.id }],
  };
}

// --- Scoring and next hole ----------------------------------------------------

function finishHole(state: GameState, events: readonly GameEvent[]): Step {
  const scores = scoreHole(state.players);
  const players = state.players.map((player) => {
    const score = scores[player.id];
    invariant(score !== undefined, `no score for ${player.id}`);
    return { ...player, holeScores: [...player.holeScores, score] };
  });

  const lastHole = state.hole >= state.settings.holes;
  const finished: GameState = {
    ...state,
    players,
    phase: lastHole ? { type: "gameOver" } : { type: "holeOver" },
  };
  const allEvents: GameEvent[] = [...events, { type: "holeScored", scores }];
  if (lastHole) {
    allEvents.push({ type: "gameOver", winnerIds: getWinnerIds(players) });
  }
  return { state: finished, events: allEvents };
}

function startNextHole(state: GameState, rng: Rng): Step {
  const dealerIndex = (state.dealerIndex + 1) % state.players.length;
  const dealt = dealHole(state.players, dealerIndex, rng);
  const dealer = dealt.players[dealerIndex];
  invariant(dealer !== undefined, "the dealer is not seated");

  const hole = state.hole + 1;
  return {
    state: {
      ...state,
      players: dealt.players,
      deck: dealt.deck,
      discard: dealt.discard,
      hole,
      dealerIndex,
      currentPlayerIndex: (dealerIndex + 1) % state.players.length,
      phase: initialFlipPhase(dealt.players.map((player) => player.id)),
      finalTurnTriggeredBy: null,
    },
    events: [{ type: "holeStarted", hole, dealerId: dealer.id }],
  };
}
