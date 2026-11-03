import { describe, expect, it } from "vitest";
import { secondsUntil } from "./countdown";

describe("secondsUntil", () => {
  it("counts down from what the server said", () => {
    // The server sent this at its time 1000, with the deadline 30s later.
    expect(secondsUntil(31_000, 1_000, 500, 500)).toBe(30);
    expect(secondsUntil(31_000, 1_000, 500, 10_500)).toBe(20);
  });

  it("rounds up, so it never shows 0 while time is left", () => {
    expect(secondsUntil(31_000, 1_000, 0, 29_100)).toBe(1);
  });

  it("does not care how wrong this device's clock is", () => {
    const fast = 1_000_000_000;
    expect(secondsUntil(31_000, 1_000, fast, fast + 5_000)).toBe(25);
  });

  it("stops at zero", () => {
    expect(secondsUntil(31_000, 1_000, 0, 99_999)).toBe(0);
  });
});
