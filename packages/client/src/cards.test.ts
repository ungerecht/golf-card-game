import { describe, expect, it } from "vitest";
import { buildDeck } from "@golf/shared";
import {
  CARD_IMAGE_COUNT,
  RANK_WORDS,
  cardBackUrl,
  cardLabel,
  cardUrl,
  emptySlotUrl,
  selectionUrl,
} from "./cards";

describe("card images", () => {
  it("has a face for all 52 cards, each one different", () => {
    const urls = buildDeck().map((card) => cardUrl(card));
    expect(new Set(urls).size).toBe(52);
  });

  it("has a back, an empty slot and a selection outline", () => {
    const urls = [cardBackUrl(), emptySlotUrl(), selectionUrl()];
    expect(new Set(urls).size).toBe(3);
  });

  it("has no stray files: 55 images", () => {
    expect(CARD_IMAGE_COUNT).toBe(52 + 3);
  });

  it("names every rank", () => {
    expect(Object.keys(RANK_WORDS)).toHaveLength(13);
    expect(new Set(Object.values(RANK_WORDS)).size).toBe(13);
  });

  it("describes a card for alt text", () => {
    expect(cardLabel({ id: "Q-hearts", rank: "Q", suit: "hearts" })).toBe(
      "Queen of hearts",
    );
    expect(cardLabel({ id: "10-spades", rank: "10", suit: "spades" })).toBe(
      "Ten of spades",
    );
  });
});
