import { describe, expect, it } from "vitest";
import { buildGameResult } from "./results";

const roster = [
  { id: "a", name: "Ann", avatar: "fox", isBot: false },
  { id: "b", name: "Ben", avatar: "owl", isBot: false },
  { id: "c", name: "Bot 1", avatar: "cat", isBot: true },
] as const;

const player = (id: string, holeScores: number[]) => ({ id, holeScores });

describe("buildGameResult", () => {
  it("ranks players by total, lowest first, with totals and hole scores", () => {
    const result = buildGameResult(
      [player("a", [10, 5]), player("b", [3, 4]), player("c", [20, 1])],
      roster,
    );
    expect(result.scoresheet.map((r) => [r.playerId, r.total, r.rank])).toEqual(
      [
        ["b", 7, 1],
        ["a", 15, 2],
        ["c", 21, 3],
      ],
    );
    expect(result.scoresheet[0]).toMatchObject({
      name: "Ben",
      avatar: "owl",
      isBot: false,
      holeScores: [3, 4],
      winner: true,
    });
    expect(result.winners.map((w) => w.playerId)).toEqual(["b"]);
  });

  it("shares first place when the lowest totals are level, and skips the next rank", () => {
    const result = buildGameResult(
      [player("a", [5]), player("b", [9]), player("c", [5])],
      roster,
    );
    expect(
      result.scoresheet.map((r) => [r.playerId, r.rank, r.winner]),
    ).toEqual([
      ["a", 1, true],
      ["c", 1, true],
      ["b", 3, false],
    ]);
    expect(result.winners.map((w) => w.name)).toEqual(["Ann", "Bot 1"]);
  });

  it("keeps a player's name on the sheet even when they are no longer on the roster", () => {
    const result = buildGameResult([player("ghost", [1])], []);
    expect(result.scoresheet[0]?.name).toBe("ghost");
  });
});
