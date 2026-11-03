import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchMaker, type Server } from "colyseus";
import { createGameServer, restrictOrigins } from "./server";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const SITE = "https://cardgolf.party";
const original = matchMaker.controller.getCorsHeaders;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  restrictOrigins([SITE]);
  const port = await freePort();
  server = createGameServer();
  await server.listen(port);
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  matchMaker.controller.getCorsHeaders = original;
  await server.gracefullyShutdown(false);
});

describe("running on the internet", () => {
  it("answers /health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("lets the real site call it from a browser", async () => {
    const response = await fetch(`${baseUrl}/rooms/ZZZZZ`, {
      headers: { origin: SITE },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
  });

  it("does not let any other site call it", async () => {
    const response = await fetch(`${baseUrl}/rooms/ZZZZZ`, {
      headers: { origin: "https://evil.example" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
  });

  it("answers the browser's preflight check for the matchmaker", async () => {
    const response = await fetch(`${baseUrl}/matchmake/create/golf`, {
      method: "OPTIONS",
      headers: { origin: SITE, "access-control-request-method": "POST" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
  });
});
