# Golf Card Game

A browser-based multiplayer Six Card Golf game built in TypeScript as a pnpm monorepo. The project is structured around a shared game engine, a React client, and a Colyseus-powered multiplayer server.

## Overview

This project is an open-source online implementation of Six Card Golf designed for play with friends. Players join a room by a host-generated lobby code, choose a name and avatar, and then play the game in a shared multiplayer session. The stack is intentionally chosen to support the immediate game flow while leaving room for future features such as room chat, bot players, and public/private lobbies.

## Detailed tech stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Language | TypeScript | Main application language across the project |
| Package manager | pnpm | Monorepo dependency and script management |
| Frontend | React 19 | UI framework |
| Build tooling | Vite | Local development server and production bundling |
| State management | Zustand | Client-side game state |
| UI animation | Motion | Transition and animation effects |
| Multiplayer server | Colyseus | Room-based matchmaking and state sync |
| Server runtime | Node.js | Game server runtime |
| Validation | Zod | Runtime schema validation for messages and state |
| Testing | Vitest | Unit and package-level tests |
| E2E testing | Playwright | Browser automation and full-flow validation |
| Linting | ESLint | Code quality checks |
| Formatting | Prettier | Consistent code style |
| CI | GitHub Actions | Automated validation on push and pull request |

## Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── e2e/
├── packages/
│   ├── client/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── server/
│   │   ├── src/
│   │   └── package.json
│   └── shared/
│       ├── src/
│       └── package.json
├── .gitignore
├── .nvmrc
├── .prettierrc
├── eslint.config.js
├── LICENSE.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── playwright.config.ts
├── tsconfig.base.json
├── tsconfig.json
├── PLAN.md
└── README.md
```

## Development workflow

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- pnpm 12+

### Install dependencies

```bash
pnpm install
```

### Start the project

```bash
pnpm dev
```

This launches the client and server packages in parallel via the root workspace script.

### Production build

```bash
pnpm build
```

### Validation

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

## Future feature support

| Feature | Approach |
| --- | --- |
| Room chat | Add a message type on the same room connection with server-side rate limiting and profanity filtering |
| Basic animations | Drive them from client state changes with Motion; each action can be animated as it occurs |
| Bot players | Use the same engine from a server-side function such as `chooseAction(state, playerId)` |
| Public/private lobbies | Use Colyseus room metadata with a `private` flag and room listing support |

## Project goals

- keep the game rules shared across client and server
- use room-based multiplayer patterns for predictable state sync
- keep the frontend focused on UI and interaction while the server owns authority
- maintain a clean monorepo layout suitable for future expansion

## Status

The repository is set up as a multiplayer game architecture scaffold for Six Card Golf and is ready for implementation of the actual rules, lobby flow, server rooms, and game board UI.
