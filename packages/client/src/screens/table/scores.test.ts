import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  getPlayerView,
  type GameState,
} from "@golf/shared";
import { lobby, player } from "../../test/fakes";
import { scoreColumns } from "./scores";

const snapshot = lobby([
  player("a", "Ann", "visor"),
  player("b", "Bo", "teal"),
]);

describe("scoreColumns", () => {
  it("has a column per player in seating order, with names and totals", () => {
    const start = createGame(DEFAULT_SETTINGS, ["a", "b"], () => 0.5);
    const state: GameState = {
      ...start,
      players: [
        { ...start.players[0]!, holeScores: [3, -2, 10] },
        { ...start.players[1]!, holeScores: [7, 0, 4] },
      ],
    };
    const columns = scoreColumns(getPlayerView(state, "b"), snapshot);
    expect(columns.map((c) => c.name)).toEqual(["Ann", "Bo"]);
    expect(columns.map((c) => c.total)).toEqual([11, 11]);
    expect(columns.map((c) => c.holeScores)).toEqual([
      [3, -2, 10],
      [7, 0, 4],
    ]);
    expect(columns.map((c) => c.isViewer)).toEqual([false, true]);
  });

  it("starts everyone on zero", () => {
    const start = createGame(DEFAULT_SETTINGS, ["a", "b"], () => 0.5);
    const columns = scoreColumns(getPlayerView(start, "a"), snapshot);
    expect(columns.map((c) => c.total)).toEqual([0, 0]);
    expect(columns[0]?.holeScores).toEqual([]);
  });

  it("copes with a player the lobby does not list", () => {
    const start = createGame(DEFAULT_SETTINGS, ["a", "z"], () => 0.5);
    const [, second] = scoreColumns(getPlayerView(start, "a"), snapshot);
    expect(second).toMatchObject({ name: "Player", avatar: null });
  });
});
