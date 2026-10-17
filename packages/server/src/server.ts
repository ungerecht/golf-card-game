import {
  Server,
  WebSocketTransport,
  createEndpoint,
  createRouter,
  matchMaker,
} from "colyseus";
import { ROOM_NAME, type RoomStatusResponse } from "@golf/shared";
import { normalizeLobbyCode } from "./codes";
import { createGolfRoom, type GolfRoomConfig } from "./GolfRoom";

/** `GET /rooms/ABCDE`: lets the Join button check a code before connecting. */
const roomStatus = createEndpoint(
  "/rooms/:code",
  { method: "GET" },
  async (ctx) => {
    const code = normalizeLobbyCode(ctx.params.code);
    const room = await matchMaker.getRoomById(code);
    const body: RoomStatusResponse = {
      status:
        room === undefined || room.name !== ROOM_NAME
          ? "missing"
          : room.metadata?.started === true
            ? "started"
            : // Colyseus also locks a room the moment it fills up.
              room.locked || room.clients >= room.maxClients
              ? "full"
              : "open",
    };
    return ctx.json(body);
  },
);

export function createGameServer(config: GolfRoomConfig = {}): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: false,
  });
  server.router = createRouter({ roomStatus }, { openapi: { disabled: true } });
  server.define(ROOM_NAME, createGolfRoom(config));
  return server;
}
