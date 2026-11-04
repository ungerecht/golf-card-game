# @golf/client

The browser app: React 19, built with Vite. It shows the lobby and the table and sends the player's moves to the server. It never decides anything about the game itself.

```sh
pnpm --filter @golf/client dev     # http://localhost:5173
pnpm --filter @golf/client test
pnpm --filter @golf/client build
```

In development it connects to `ws://localhost:2567`. Production builds use `.env.production`, which points at `wss://api.cardgolf.party`. Set `VITE_SERVER_URL` to use another server.

## Layout

Code is grouped by feature under `src/`, and each component keeps its CSS next to it. Import from `src/` with the `@/` alias.

- `app/`: the app shell, routes and global styles.
- `features/`: `landing`, `lobby`, `chat` and `game` (the table, dialogs, card sprites, animation, and the pure helpers in `model/`).
- `components/`: small pieces shared by several features, such as `Avatar` and `Dialog`.
- `store/`: one Zustand store holding everything the screens know about the room.
- `net/`: the connector that talks to Colyseus. Tests swap in a fake with the same shape.
- `lib/`: helpers and asset lookups.
- `assets/`: card and avatar art.

How these pieces fit together is described in [ARCHITECTURE.md](../../ARCHITECTURE.md#client).
