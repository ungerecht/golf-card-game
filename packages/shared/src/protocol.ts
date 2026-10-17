// The messages between client and server. Everything here is plain JSON.
import { z } from "zod";
import { ActionSchema } from "./engine/actions";
import type { ActionError } from "./engine/rules";
import type { GameEvent } from "./engine/events";
import { DEFAULT_SETTINGS, GameSettingsSchema } from "./engine/settings";
import type { GameSettings } from "./engine/settings";
import type { PlayerId } from "./engine/state";
import type { GameView } from "./engine/views";

/** The name of the Colyseus room the server registers. */
export const ROOM_NAME = "golf";

/** Preset avatars. Players send the id, never an image. */
export const AVATAR_IDS = [
  "visor",
  "teal",
  "lavender",
  "bucket",
  "chip",
  "ginger",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export const PLAYER_NAME_MAX_LENGTH = 20;

/** 1 to 20 characters once trimmed, with no control characters. */
export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_NAME_MAX_LENGTH)
  .regex(/^[^\p{Cc}]+$/u);

/**
 * What a player sends to claim a seat, the host included. Connecting alone
 * only puts you in the waiting room; this is what takes a slot.
 */
export const ReadyPayloadSchema = z.object({
  name: PlayerNameSchema,
  avatar: z.literal(AVATAR_IDS),
});
export type ReadyPayload = z.infer<typeof ReadyPayloadSchema>;

/** What the host sends when creating a room. Missing settings get their defaults. */
export const CreateOptionsSchema = z.object({
  settings: GameSettingsSchema.default(DEFAULT_SETTINGS),
});
export type CreateOptions = z.infer<typeof CreateOptionsSchema>;

/** Answer of `GET /rooms/:code`, so a client can check a code before connecting. */
export type RoomStatus = "open" | "full" | "started" | "missing";
export interface RoomStatusResponse {
  readonly status: RoomStatus;
}

// Client to server

/** Message types a client can send. "start" has no payload. */
export const CLIENT_MESSAGE = {
  /** Claim a seat with a name and avatar. The payload is a `ReadyPayload`. */
  ready: "ready",
  /** The host starts the game. */
  start: "start",
  /** After the game is over, the host starts another one with the same rules and players. */
  playAgain: "playAgain",
  /** Play an action. The payload is an `Action`. */
  action: "action",
} as const;

export { ActionSchema };

// Server to client

export interface LobbyPlayer {
  /** The player's session id. Also their id inside the game. */
  readonly id: PlayerId;
  readonly name: string;
  readonly avatar: AvatarId;
  readonly isBot: boolean;
  /** False while a dropped player has a chance to reconnect. */
  readonly connected: boolean;
  /**
   * When a bot takes over the seat of a dropped player, as milliseconds since
   * 1970 on the server's clock (compare with `serverTime`). `null` unless the
   * player is dropped and it is their turn, because the countdown only runs then.
   */
  readonly reconnectDeadline: number | null;
}

/** Who is in the room. Sent whenever anything about it changes. */
export interface LobbySnapshot {
  /** The lobby code. It is also the room id. */
  readonly code: string;
  readonly hostId: PlayerId;
  readonly settings: GameSettings;
  /** In seating order. The host is first, and bots come last. */
  readonly players: readonly LobbyPlayer[];
  readonly started: boolean;
  /** The server's clock when this was sent, to work out the countdowns. */
  readonly serverTime: number;
}

/** One line of the final scoresheet. */
export interface ScoreRow {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly avatar: AvatarId;
  readonly isBot: boolean;
  /** Score of each hole, in order. */
  readonly holeScores: readonly number[];
  readonly total: number;
  /** 1 for the lowest total. Players with equal totals share a rank. */
  readonly rank: number;
  readonly winner: boolean;
}

/** How a finished game ended. */
export interface GameResult {
  /** Best score first. Players with equal totals stay in seating order. */
  readonly scoresheet: readonly ScoreRow[];
  /** Everyone who tied for the lowest total, in seating order. */
  readonly winners: readonly ScoreRow[];
}

/** The latest state of the game for one player, plus what just happened. */
export interface GameUpdate {
  readonly view: GameView;
  /** Empty when this is only a refresh, for example after reconnecting. */
  readonly events: readonly GameEvent[];
  /** The server's clock when this was sent, to work out the countdowns. */
  readonly serverTime: number;
  /**
   * When the next hole starts by itself, as milliseconds since 1970 on the
   * server's clock. `null` unless a hole has just finished. The host can start
   * it sooner.
   */
  readonly nextHoleAt: number | null;
  /** Set once the game is over. */
  readonly result: GameResult | null;
}

export type RoomErrorCode =
  | ActionError
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  | "ALREADY_STARTED"
  | "NOT_STARTED"
  | "NOT_GAME_OVER"
  | "ROOM_FULL"
  | "NOT_READY"
  | "ALREADY_READY"
  | "AVATAR_TAKEN"
  | "BAD_MESSAGE";

export interface RoomError {
  readonly code: RoomErrorCode;
}

export type RoomClosedReason = "HOST_LEFT" | "TIMED_OUT" | "GAME_STARTED";

export interface RoomClosed {
  readonly reason: RoomClosedReason;
}

/** Message types the server sends, with their payloads. */
export interface ServerMessages {
  lobby: LobbySnapshot;
  game: GameUpdate;
  error: RoomError;
  /** The room is closing and the connection is about to be dropped. */
  closed: RoomClosed;
}
export type ServerMessageType = keyof ServerMessages;

// Lobby codes

/** No 0, O, 1, I or L, so codes are easy to read out loud. */
export const LOBBY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LOBBY_CODE_LENGTH = 5;
