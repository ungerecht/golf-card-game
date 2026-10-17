// What the screens and the store need from the network, and nothing more.
// The real thing is a Colyseus client; tests use a fake with the same shape.
import type {
  GameSettings,
  RoomStatus,
  ServerMessages,
  ServerMessageType,
} from "@golf/shared";

/** One live connection to a room. */
export interface RoomHandle {
  /** The lobby code. */
  readonly code: string;
  /** Our id in the room. It is also our player id. */
  readonly sessionId: string;
  /** Lets us back into the same room after a refresh. */
  readonly reconnectionToken: string;
  send(type: string, payload?: unknown): void;
  on<K extends ServerMessageType>(
    type: K,
    callback: (message: ServerMessages[K]) => void,
  ): void;
  /** Called once when the connection ends, whoever ended it. */
  onLeave(callback: () => void): void;
  /** Leave on purpose. */
  leave(): Promise<void>;
}

export interface Connector {
  createRoom(settings: GameSettings): Promise<RoomHandle>;
  joinRoom(code: string): Promise<RoomHandle>;
  reconnect(token: string): Promise<RoomHandle>;
  /** Whether a code can be joined, without connecting. */
  roomStatus(code: string): Promise<RoomStatus>;
}
