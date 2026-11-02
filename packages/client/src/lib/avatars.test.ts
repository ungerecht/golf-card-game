import { describe, expect, it } from "vitest";
import { AVATAR_IDS } from "@golf/shared";
import { AVATAR_LABELS, avatarUrl } from "./avatars";

describe("avatars", () => {
  it("has a portrait and a label for every avatar id", () => {
    for (const id of AVATAR_IDS) {
      expect(avatarUrl(id)).toMatch(/portrait/);
      expect(AVATAR_LABELS[id]).toBeTruthy();
    }
  });
});
