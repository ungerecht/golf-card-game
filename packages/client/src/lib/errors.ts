import type { RoomErrorCode } from "@golf/shared";

const TEXT: Partial<Record<RoomErrorCode, string>> = {
  AVATAR_TAKEN: "Someone just picked that avatar. Choose another.",
  NOT_ENOUGH_PLAYERS: "You need at least two players to start.",
  NOT_READY: "Pick an avatar and a name, then press Ready first.",
  NOT_HOST: "Only the host can do that.",
  ROOM_FULL: "That room is full.",
  ALREADY_STARTED: "The game has already started.",
  ALREADY_READY: "You already have a seat.",
  NOT_YOUR_TURN: "It is not your turn.",
  WRONG_PHASE: "You cannot do that right now.",
  SLOT_FACE_UP: "That card is already face up.",
  ALREADY_FLIPPED_ENOUGH: "You have already flipped your cards.",
  NO_FACE_DOWN_CARD: "You have no face-down cards left.",
  DECK_EMPTY: "The draw pile is empty.",
  MUST_SWAP: "A card from the discard pile has to go into your hand.",
  BAD_MESSAGE: "That name or avatar was not accepted.",
};

export function errorText(code: RoomErrorCode): string {
  return TEXT[code] ?? `Something went wrong (${code}).`;
}
