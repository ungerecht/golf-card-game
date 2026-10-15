import { createGameServer } from "./server";

const port = Number(process.env.PORT ?? 2567);
const server = createGameServer();

await server.listen(port);
console.log(`Golf server listening on ws://localhost:${port}`);
