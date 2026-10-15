# @golf/server

A Colyseus server with one room type, `golf`. It runs the lobby and the game, and uses `@golf/shared` for every rule.

```sh
pnpm --filter @golf/server dev    # ws://localhost:2567, or set PORT
pnpm --filter @golf/server test
```

## How a game goes

1. The host creates a room: `client.create("golf", { name, avatar, settings })`. Settings are validated by `GameSettingsSchema`, and any missing ones get their defaults. They cannot be changed afterwards.
2. The room id is the lobby code: five characters with no `0`, `O`, `1`, `I` or `L`. Friends join with `client.joinById(code, { name, avatar })`. Names are 1 to 20 characters, avatars are ids from `AVATAR_IDS`. A name that is already taken gets a number added.
3. The host sends `start`. If Bots is on, empty seats up to Max players are filled with bots. The host sits in seat 0 and deals the first hole. The room locks.
4. Players send `action` messages (an `Action`, validated with `ActionSchema`). The room sends back what the player is allowed to see.

## Messages

Client to server: `start` and `playAgain` (no payload, host only) and `action` (an `Action`).

Server to client:

| Type    | Payload          | When                                                                  |
| ------- | ---------------- | --------------------------------------------------------------------- |
| `lobby` | `LobbySnapshot`  | On joining, and whenever the roster, host or connection state changes. |
| `game`  | `GameUpdate`     | After every action, and on reconnecting. A `GameView`, the events, `nextHoleAt` while a hole is waiting to start, and `result` once the game is over. |
| `error` | `{ code }`       | Only to the sender of a bad request. Codes are in `RoomErrorCode`.     |

The server never sends `GameState`. Each player only gets `getPlayerView` for their own seat, so hidden cards cannot leak. Events are safe for everyone: the only private information is a card drawn from the deck, and that arrives in the view.

Clients are limited to 20 messages per second.

## Between holes and after the game

- When a hole ends, only the host can start the next one early (`startNextHole`). Anyone else gets `NOT_HOST`. If the host does nothing, it starts by itself after 30 seconds. `GameUpdate.nextHoleAt` is when, on the server's clock, and `serverTime` lets a client work out the countdown.
- When the game ends, `GameUpdate.result` holds the final scoresheet (`scoresheet`, best score first, with name, avatar, hole scores, total and rank) and `winners` (everyone tied for the lowest total). It is written down when the game ends, so players who leave afterwards stay on it.
- The host can send `playAgain` to deal a new game with the same settings and the players who are still there, host first. Empty seats are refilled with bots if Bots is on. It needs at least two players, otherwise the host gets `NOT_ENOUGH_PLAYERS`.
- Any player can leave at any point with `room.leave()`. After the game their seat is freed for good.

## Leaving and reconnecting

- In the lobby, a player who leaves frees their seat. If it was the host, the next player becomes host.
- During a game, a dropped player has 2 minutes to come back, but the clock only starts once the game is waiting for them: when it becomes their turn, or straight away if they still have initial flips to make. `LobbyPlayer.reconnectDeadline` is when it runs out, or `null` while it is not running. They get back in with `client.reconnect(reconnectionToken)` and receive a fresh `lobby` and `game` message.
- If they do not come back, or leave on purpose, a bot takes over their seat and the game carries on.
- Once the game is over, a player who drops is let go straight away.

## Layout

- `src/gameSession.ts`: seats, lobby, running the game and driving bots. No networking, so it is tested with fake timers.
- `src/GolfRoom.ts`: the Colyseus room. It validates messages and forwards them to the session.
- `src/server.ts`: builds the server. `src/index.ts` starts it.
- `src/room.e2e.test.ts`: starts a real server and plays against it with the Colyseus client.
