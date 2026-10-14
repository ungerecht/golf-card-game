import { z } from "zod";
import { SLOT_INDEXES } from "./state";

const SlotSchema = z.literal(SLOT_INDEXES);

/**
 * What a player can ask to do. Actions deliberately carry no player id: the
 * server knows who sent each message and passes that id to the reducer
 * separately, so a client can never act as someone else.
 *
 * The server should run incoming messages through `ActionSchema.safeParse`
 * before touching game state.
 */
export const ActionSchema = z.discriminatedUnion("type", [
  /** Phase "initialFlip": turn one more of your cards face up. Everyone flips until they have the number the round asks for (two to start with). */
  z.object({ type: z.literal("flipInitial"), slot: SlotSchema }),
  /** Phase "flipOrDraw": turn a face-down card face up */
  z.object({ type: z.literal("flip"), slot: SlotSchema }),
  /** Phase "flipOrDraw": take the top card of the deck. */
  z.object({ type: z.literal("drawFromDeck") }),
  /** Phase "flipOrDraw": take the top card of the discard pile. */
  z.object({ type: z.literal("drawFromDiscard") }),
  /** Phase "place": put the drawn card in a slot, discarding the card that was there. */
  z.object({ type: z.literal("swapDrawn"), slot: SlotSchema }),
  /** Phase "place": discard the drawn card. Only allowed if it came from the deck. */
  z.object({ type: z.literal("discardDrawn") }),
  /** Phase "holeOver": deal the next hole. */
  z.object({ type: z.literal("startNextHole") }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

// placeholders for potentially needed future actions.

// join room
// mark self ready for game start
// exit room
// deal cards to players
// set player ready
// flip up all cards in all player grids
// set player turn
// next player turn
// initialize lobby scoresheet
// update lobby scoresheet
// set player name
// set game settings
// create room
// generate room code
// set player name
// set game settings
// start game
// end game
