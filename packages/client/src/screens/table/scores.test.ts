import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  buildGameResult,
  createGame,
  getPlayerView,
  type GameState,
} from "@golf/shared";
import { lobby, player } from "../../test/fakes";
import { resultColumns, scoreColumns, winnerText } from "./scores";

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

describe("winnerText", () => {
  const roster = [
    { id: "a", name: "Ann", avatar: "visor" as const, isBot: false },
    { id: "b", name: "Bo", avatar: "teal" as const, isBot: false },
    { id: "c", name: "Cy", avatar: "lavender" as const, isBot: false },
  ];
  const result = (scores: number[][]) =>
    buildGameResult(
      scores.map((holeScores, i) => ({ id: roster[i]!.id, holeScores })),
      roster,
    );

  it("names a single winner, or says you won", () => {
    const r = result([[5], [2], [9]]);
    expect(winnerText(r, "a")).toBe("Bo wins!");
    expect(winnerText(r, "b")).toBe("You win!");
    expect(winnerText(r, null)).toBe("Bo wins!");
  });

  it("lists everyone in a tie", () => {
    expect(winnerText(result([[2], [2], [9]]), "c")).toBe("Ann and Bo tie!");
    expect(winnerText(result([[2], [2], [2]]), "a")).toBe(
      "Ann, Bo and Cy tie!",
    );
  });
});

describe("resultColumns", () => {
  it("lists the players best first and marks you", () => {
    const roster = [
      { id: "a", name: "Ann", avatar: "visor" as const, isBot: false },
      { id: "b", name: "Bo", avatar: "teal" as const, isBot: false },
    ];
    const r = buildGameResult(
      [
        { id: "a", holeScores: [9, 1] },
        { id: "b", holeScores: [2, 2] },
      ],
      roster,
    );
    const columns = resultColumns(r, "a");
    expect(columns.map((c) => c.name)).toEqual(["Bo", "Ann"]);
    expect(columns.map((c) => c.total)).toEqual([4, 10]);
    expect(columns.map((c) => c.isViewer)).toEqual([false, true]);
  });
});
