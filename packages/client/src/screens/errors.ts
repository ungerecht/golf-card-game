import type { RoomErrorCode } from "@golf/shared";

const TEXT: Partial<Record<RoomErrorCode, string>> = {
  AVATAR_TAKEN: "Someone just picked that avatar. Choose another.",
  NOT_ENOUGH_PLAYERS: "You need at least two players to start.",
  NOT_READY: "Pick an avatar and a name, then press Ready first.",
  NOT_HOST: "Only the host can do that.",
  ROOM_FULL: "That room is full.",
  ALREADY_STARTED: "The game has already started.",
  ALREADY_READY: "You already have a seat.",
  BAD_MESSAGE: "That name or avatar was not accepted.",
};

export function errorText(code: RoomErrorCode): string {
  return TEXT[code] ?? `Something went wrong (${code}).`;
}
