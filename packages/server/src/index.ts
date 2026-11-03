import { parseAllowedOrigins } from "./cors";
import { createGameServer, restrictOrigins } from "./server";

const port = Number(process.env.PORT ?? 2567);
restrictOrigins(parseAllowedOrigins(process.env.ALLOWED_ORIGINS));
const server = createGameServer();

// Docker stops a container with SIGTERM. Games are in memory, so there is
// nothing to save: just exit now instead of waiting to be killed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => process.exit(0));
}

await server.listen(port);
console.log(`Golf server listening on port ${port}`);
