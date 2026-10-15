import { Server, WebSocketTransport } from "colyseus";
import { ROOM_NAME } from "@golf/shared";
import { createGolfRoom, type GolfRoomConfig } from "./GolfRoom";

export function createGameServer(config: GolfRoomConfig = {}): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, createGolfRoom(config));
  return server;
}
