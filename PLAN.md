# Six Card Golf Online: Tech Stack Plan

Oct 13, 2026 · @Avery Ungerecht

## Overview

Use TypeScript end to end: React with Vite on the client, Node.js with Colyseus on the server, and a shared package holding the pure game engine. The project is an open source, browser-based multiplayer Six Card Golf with 2D graphics. Players join friends with a host-generated lobby code, and everyone picks a name and avatar before joining. The stack below is chosen to make that flow simple now and to leave room for room chat, animations, bot players and public/private lobbies later.

## Recommended stack

### Language

- TypeScript everywhere. The biggest win is sharing types and game rules between client and server.

### Front-end

- React with Vite for the app shell and build tooling.
- Zustand for client state. It is small and easy for contributors to pick up.
- Plain DOM and CSS for the game board, not a canvas engine. Six Card Golf is a grid of cards, a draw pile and a discard pile, so DOM elements give you accessibility, easy styling and simple click handling for free. Use SVG or image sprites for card faces and avatars.
- Motion (formerly Framer Motion) for future animations. Card draws, flips and swaps map well to its layout animations.
- If you later want heavy particle effects or a more game-like feel, PixiJS with `@pixi/react` is the upgrade path, but avoid it at the start.

### Back-end

- Node.js with Colyseus for real-time multiplayer. It is built around rooms, so it covers most requirements out of the box: room creation with options (the host settings), join by room ID (the lobby code), reconnection handling, automatic state sync, and room listings with metadata (which enables public/private lobbies later).
- The main alternative is Socket.IO with your own room manager. It is more familiar and gives full control, but you would build lobby, reconnection and state sync yourself. It suits a minimal dependency footprint.
- Zod to validate all incoming messages and room settings.

### Project structure

- A pnpm workspace monorepo with three packages: `client`, `server` and `shared`.
- Put the game engine in `shared` as pure TypeScript: `applyAction(state, action) => newState`, plus rule validation and scoring. No networking or UI. This makes it trivial to unit test, and it is exactly what future bots need.

### Tooling and quality

- Vitest for unit tests (especially the game engine) and Playwright for a multi-browser end-to-end test of a full game.
- ESLint, Prettier and GitHub Actions for CI.
- A CONTRIBUTING file and a "good first issue" label to attract contributors.

### Hosting and persistence

- Start with in-memory rooms and no database. Rooms are short-lived, so none is needed.
- Deploy the client as a static site (Cloudflare Pages, Netlify or Vercel) and the Node server on a host that supports WebSockets (Fly.io, Railway or Render) via a Dockerfile.
- To scale across multiple server instances later, Colyseus supports Redis-backed presence and matchmaking.
- Store avatar and name in localStorage so returning players do not retype them. Use a fixed set of preset avatars stored as IDs rather than uploads, which avoids moderation and storage headaches.

## Design decisions worth making early

1. **Make the server authoritative.** Clients send intents ("swap card in slot 3 with the discard") and the server validates and applies them. This prevents cheating.
2. **Do not leak hidden information.** In Six Card Golf, face-down cards matter. Send each client only the card values it is allowed to see, not the full state. Colyseus supports per-client state filtering, or you can send tailored snapshots yourself.
3. **Generate lobby codes carefully.** Use 4 to 6 characters from an alphabet without lookalikes (no 0/O, 1/I/L), and check for collisions against active rooms.
4. **Plan for reconnection.** Players on phones will drop connections. Give each player a session token so they can rejoin their seat mid-game.
5. **Model game settings as a typed object.** Settings such as number of holes (rounds), number of players and house rules should live in a shared Zod schema, so adding an option later is a one-place change.

## How the stack supports future features

| Feature | Approach |
| --- | --- |
| Room chat | Another message type on the same room connection. Add per-player rate limiting and a simple profanity filter on the server. |
| Basic animations | Drive them from client state changes with Motion. Because the engine emits discrete actions, each one (draw, swap, flip) can be animated as it happens. |
| Bot players | The engine is pure and shared, so a bot is a function `chooseAction(state, playerId)` run server-side that occupies a seat. Start with a simple heuristic bot and add difficulty levels later. |
| Public/private lobbies | Colyseus room listings with a `private` flag in the metadata. Private rooms are joinable by code only, and public ones appear in a browsable list. |

## Suggested build order

1. Build and fully test the game engine in `shared` (rules, scoring, turn flow) with no UI.
2. Build a bare-bones server room that wraps the engine.
3. Build the React lobby flow (name, avatar, create or join by code).
4. Build the game board UI.
5. Add reconnection, then polish and the future features.