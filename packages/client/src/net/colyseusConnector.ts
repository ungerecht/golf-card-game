import { Client, type Room } from "@colyseus/sdk";
import {
  ROOM_NAME,
  type GameSettings,
  type RoomStatus,
  type RoomStatusResponse,
  type ServerMessages,
  type ServerMessageType,
} from "@golf/shared";
import { SERVER_URL, httpUrl } from "./config";
import type { Connector, RoomHandle } from "./types";

function wrap(room: Room): RoomHandle {
  return {
    code: room.roomId,
    sessionId: room.sessionId,
    reconnectionToken: room.reconnectionToken,
    send: (type, payload) => room.send(type, payload),
    on: <K extends ServerMessageType>(
      type: K,
      callback: (message: ServerMessages[K]) => void,
    ) => {
      room.onMessage(type, callback);
    },
    onLeave: (callback) => {
      room.onLeave(() => callback());
    },
    leave: async () => {
      await room.leave();
    },
  };
}

export function createColyseusConnector(serverUrl = SERVER_URL): Connector {
  const client = new Client(serverUrl);
  return {
    createRoom: async (settings: GameSettings) =>
      wrap(await client.create(ROOM_NAME, { settings })),
    joinRoom: async (code) => wrap(await client.joinById(code)),
    reconnect: async (token) => wrap(await client.reconnect(token)),
    roomStatus: async (code): Promise<RoomStatus> => {
      try {
        const response = await fetch(
          `${httpUrl(serverUrl)}/rooms/${encodeURIComponent(code)}`,
        );
        if (!response.ok) return "missing";
        return ((await response.json()) as RoomStatusResponse).status;
      } catch {
        // The server could not be reached. Treat it like a room that is not there.
        return "missing";
      }
    },
  };
}
