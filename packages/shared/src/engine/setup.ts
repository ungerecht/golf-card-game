import { buildDeck, shuffle, type Card } from "./cards";
import { toGrid } from "./grid";
import { invariant } from "./invariant";
import type { Rng } from "./rng";
import type { GameSettings } from "./settings";
import {
  INITIAL_FLIPS,
  SLOT_INDEXES,
  type GameState,
  type Phase,
  type PlayerId,
  type PlayerState,
} from "./state";

export interface DealtHole {
  readonly players: PlayerState[];
  /** Draw pile. The next card drawn is the last element. */
  readonly deck: Card[];
  /** Discard pile with a single face-up card to start it. */
  readonly discard: Card[];
}

/** Where every hole starts: everyone flips two cards, and all players compete to go first. */
export function initialFlipPhase(
  playerIds: readonly PlayerId[],
): Extract<Phase, { type: "initialFlip" }> {
  return {
    type: "initialFlip",
    flipsRequired: INITIAL_FLIPS,
    contenders: [...playerIds],
  };
}

/**
 * Shuffle a fresh deck and deal one hole.
 *
 * Cards are dealt face down, one at a time, starting with the player to the
 * dealer's left, until everyone has six. The next card starts the discard
 * pile and the rest become the draw pile.
 *
 * Each player's earlier hole scores are carried over.
 */
export function dealHole(
  players: readonly Omit<PlayerState, "grid">[],
  dealerIndex: number,
  rng: Rng,
): DealtHole {
  const seatCount = players.length;
  const deck = shuffle(buildDeck(), rng);
  const hands: Card[][] = players.map(() => []);

  for (let round = 0; round < SLOT_INDEXES.length; round++) {
    for (let offset = 1; offset <= seatCount; offset++) {
      const seat = (dealerIndex + offset) % seatCount;
      const card = deck.pop();
      const hand = hands[seat];
      invariant(
        card !== undefined && hand !== undefined,
        "the deck ran out while dealing",
      );
      hand.push(card);
    }
  }

  const starter = deck.pop();
  invariant(starter !== undefined, "no card left to start the discard pile");

  return {
    players: players.map((player, seat) => {
      const hand = hands[seat];
      invariant(hand !== undefined, "a player was not dealt a hand");
      return {
        id: player.id,
        holeScores: player.holeScores,
        grid: toGrid(hand),
      };
    }),
    deck,
    discard: [starter],
  };
}

/**
 * Create a new game and deal the first hole.
 *
 * `playerIds` is the seating order, clockwise. The first id is the room host,
 * who deals the first hole. Throws if the player count is outside 2 to
 * `settings.maxPlayers` or if an id appears twice: the server should validate
 * these before calling.
 */
export function createGame(
  settings: GameSettings,
  playerIds: readonly PlayerId[],
  rng: Rng,
): GameState {
  if (playerIds.length < 2 || playerIds.length > settings.maxPlayers) {
    throw new Error(
      `A game needs between 2 and ${settings.maxPlayers} players, got ${playerIds.length}`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Player ids must be unique");
  }

  const dealerIndex = 0;
  const dealt = dealHole(
    playerIds.map((id) => ({ id, holeScores: [] })),
    dealerIndex,
    rng,
  );

  return {
    settings,
    players: dealt.players,
    deck: dealt.deck,
    discard: dealt.discard,
    hole: 1,
    dealerIndex,
    currentPlayerIndex: (dealerIndex + 1) % playerIds.length,
    phase: initialFlipPhase(playerIds),
    finalTurnTriggeredBy: null,
  };
}
