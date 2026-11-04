# @golf/shared

The Six Card Golf game engine and the message types shared by the client and the server. It has no networking or UI code, so the server, the client and the bots all play by exactly the same rules.

The rules themselves are written up in [GAMERULES.md](../../GAMERULES.md), which is the source of truth. This package implements them.

```sh
pnpm --filter @golf/shared test
pnpm --filter @golf/shared typecheck
```

## What is in it

- `src/engine/`: the game. State is plain data, and every change goes through one pure function, `applyAction(state, playerId, action, rng)`. It returns the new state and the events that happened, or an error for an illegal move.
  - `state.ts`, `cards.ts`, `grid.ts`: the types and the deck.
  - `setup.ts`: creating a game and dealing a hole.
  - `rules.ts`: `validateAction` and `getLegalActions`.
  - `reducer.ts`: `applyAction`.
  - `scoring.ts`: card values and column matching.
  - `views.ts`: `getPlayerView`, which hides what a player must not see.
  - `bots.ts`: `chooseAction`, which picks a move from a player's view.
  - `settings.ts`, `actions.ts`, `events.ts`: Zod schemas and types for the host settings, player actions and game events.
  - `rng.ts`: the random source is passed in, so tests can use a seeded one.
- `src/protocol.ts`: the messages between client and server, with Zod schemas to validate anything a client sends.
- `src/results.ts`: building the final scoresheet.
- `src/index.ts`: the public API. Only what the client and server need is exported.

## Why it is built this way

- **Pure and deterministic.** No clocks and no `Math.random` inside the engine, so a game can be replayed from a seed. A fuzz test plays random games and checks the invariants after every move.
- **Validated at the edge.** The server parses every incoming message with the schemas in `protocol.ts` and `actions.ts` before the engine sees it.
- **No leaks.** Clients never receive `GameState`, which holds the whole deck and every face-down card. They get a `GameView` for their own seat.
