import {
  Server,
  WebSocketTransport,
  createEndpoint,
  createRouter,
  matchMaker,
} from "colyseus";
import { ROOM_NAME, type RoomStatusResponse } from "@golf/shared";
import { normalizeLobbyCode } from "./codes";
import { corsOriginHeader } from "./cors";
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

/** `GET /health`: for the proxy, Docker and anyone checking the server is up. */
const health = createEndpoint("/health", { method: "GET" }, async (ctx) =>
  ctx.json({ ok: true }),
);

/**
 * Only let these web pages call the server from a browser. Colyseus answers
 * every origin by default, which is fine locally but not on the internet.
 * An empty list keeps that default.
 */
export function restrictOrigins(allowed: readonly string[]): void {
  matchMaker.controller.getCorsHeaders = (headers) =>
    corsOriginHeader(allowed, headers.get("origin"));
}

export function createGameServer(config: GolfRoomConfig = {}): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: false,
  });
  server.router = createRouter(
    { roomStatus, health },
    { openapi: { disabled: true } },
  );
  server.define(ROOM_NAME, createGolfRoom(config));
  return server;
}
