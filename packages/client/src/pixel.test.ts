import { describe, expect, it } from "vitest";
import { ART_WIDTH, handScale, pixelSize } from "./pixel";

describe("pixelSize", () => {
  it("is always a whole number of device pixels", () => {
    for (const [width, ratio] of [
      [390, 3],
      [768, 2],
      [1280, 1],
      [1440, 2],
      [1920, 1.25],
    ] as const) {
      const devicePixels = pixelSize(width, ratio) * ratio;
      expect(devicePixels).toBeCloseTo(Math.round(devicePixels), 6);
      expect(devicePixels).toBeGreaterThanOrEqual(1);
    }
  });

  it("grows with the screen", () => {
    expect(pixelSize(1280, 1)).toBeGreaterThan(pixelSize(400, 1));
  });

  it("fits the design width on a phone", () => {
    // A 390px wide phone at 3x: 1170 device pixels, so 3 per art pixel.
    expect(pixelSize(390, 3)).toBe(1);
    expect(ART_WIDTH * pixelSize(390, 3)).toBeLessThanOrEqual(390);
  });

  it("never drops below one device pixel", () => {
    expect(pixelSize(100, 1)).toBe(1);
  });
});

describe("handScale", () => {
  it("doubles the cards on a phone but not on a big screen", () => {
    expect(handScale(pixelSize(390, 3))).toBe(2);
    expect(handScale(pixelSize(1280, 1))).toBe(1);
  });
});
