import { describe, expect, it } from "vitest";
import { ALL_ACTIONS, getLegalActions } from "./rules";
import { applyAction } from "./reducer";
import { createSeededRng } from "./rng";
import { scoreGrid } from "./scoring";
import { DEFAULT_SETTINGS } from "./settings";
import { createGame } from "./setup";
import type { GameState } from "./state";
import { allCardIds, deepFreeze } from "./test-helpers";

const MAX_STEPS = 5000;

/** Play a whole game with random legal moves, checking invariants every step. */
function playRandomGame(seed: number, playerCount: number, holes: 3 | 6 | 9) {
  const rng = createSeededRng(seed);
  const picker = createSeededRng(seed + 1000);
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  let state: GameState = deepFreeze(
    createGame({ ...DEFAULT_SETTINGS, holes }, ids, rng),
  );

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (state.phase.type === "gameOver") return state;

    // Collect every (player, legal action) pair and pick one at random.
    const options = ids.flatMap((id) =>
      getLegalActions(state, id).map((action) => ({ id, action })),
    );
    expect(options.length).toBeGreaterThan(0);
    const choice = options[Math.floor(picker() * options.length)];
    if (choice === undefined) throw new Error("no options");

    const result = applyAction(state, choice.id, choice.action, rng);
    if (!result.ok) throw new Error(`legal action rejected: ${result.error}`);
    state = deepFreeze(result.state);

    const cardIds = allCardIds(state);
    expect(cardIds).toHaveLength(52);
    expect(new Set(cardIds).size).toBe(52);

    // getLegalActions must agree with applyAction for every candidate action.
    for (const id of ids) {
      const legal = getLegalActions(state, id);
      for (const action of ALL_ACTIONS) {
        const ok = applyAction(state, id, action, createSeededRng(1)).ok;
        expect(ok).toBe(
          legal.some((l) => JSON.stringify(l) === JSON.stringify(action)),
        );
      }
    }
  }
  throw new Error(`game ${seed} did not finish in ${MAX_STEPS} steps`);
}

describe("random full games", () => {
  for (const playerCount of [2, 3, 4]) {
    it(`finish cleanly with ${playerCount} players`, () => {
      for (let seed = 1; seed <= 15; seed += 1) {
        const end = playRandomGame(seed, playerCount, 3);
        expect(end.phase.type).toBe("gameOver");
        for (const p of end.players) {
          expect(p.holeScores).toHaveLength(3);
          expect(p.holeScores.every((s) => Number.isInteger(s))).toBe(true);
        }
        // The last hole's score matches the final grid.
        for (const p of end.players) {
          expect(p.holeScores.at(-1)).toBe(scoreGrid(p.grid));
        }
      }
    });
  }
});
