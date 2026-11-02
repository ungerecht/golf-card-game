import { describe, expect, it } from "vitest";
import { arrangeSeats } from "./seats";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const layout = (n: number, viewer: string | null) =>
  arrangeSeats(ids(n), viewer).map((s) => `${s.position}:${s.player.id}`);

describe("arrangeSeats", () => {
  it("puts two players top and bottom", () => {
    expect(layout(2, "p1")).toEqual(["bottom:p1", "top:p2"]);
  });

  it("puts three players left, right and bottom", () => {
    expect(layout(3, "p1")).toEqual(["bottom:p1", "left:p2", "right:p3"]);
  });

  it("puts four players left, top, right and bottom", () => {
    expect(layout(4, "p1")).toEqual([
      "bottom:p1",
      "left:p2",
      "top:p3",
      "right:p4",
    ]);
  });

  it("keeps the viewer at the bottom and goes round in turn order", () => {
    expect(layout(4, "p3")).toEqual([
      "bottom:p3",
      "left:p4",
      "top:p1",
      "right:p2",
    ]);
    expect(layout(4, "p4")).toEqual([
      "bottom:p4",
      "left:p1",
      "top:p2",
      "right:p3",
    ]);
    expect(layout(3, "p3")).toEqual(["bottom:p3", "left:p1", "right:p2"]);
    expect(layout(2, "p2")).toEqual(["bottom:p2", "top:p1"]);
  });

  it("seats everyone exactly once", () => {
    for (const n of [2, 3, 4]) {
      for (let v = 1; v <= n; v += 1) {
        const seats = arrangeSeats(ids(n), `p${v}`);
        expect(new Set(seats.map((s) => s.player.id)).size).toBe(n);
        expect(new Set(seats.map((s) => s.position)).size).toBe(n);
      }
    }
  });

  it("shows a spectator the first player at the bottom", () => {
    expect(layout(3, null)).toEqual(layout(3, "p1"));
    expect(layout(3, "stranger")).toEqual(layout(3, "p1"));
  });

  it("refuses a table of the wrong size", () => {
    expect(() => arrangeSeats([], "p1")).toThrow(RangeError);
    expect(() => arrangeSeats(ids(5), "p1")).toThrow(RangeError);
  });
});
