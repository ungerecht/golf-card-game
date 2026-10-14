import { describe, expect, it } from "vitest";
import { buildDeck, shuffle } from "./cards";
import { createSeededRng } from "./rng";

describe("buildDeck", () => {
  it("builds a standard 52 card deck", () => {
    expect(buildDeck()).toHaveLength(52);
  });

  it("gives every card a unique id", () => {
    const ids = buildDeck().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shuffle", () => {
  const deck = buildDeck();

  it("keeps exactly the same cards", () => {
    const shuffled = shuffle(deck, createSeededRng(1));
    expect(shuffled).toHaveLength(deck.length);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(
      new Set(deck.map((c) => c.id)),
    );
  });

  it("does not change the input array", () => {
    const before = deck.map((c) => c.id);
    shuffle(deck, createSeededRng(1));
    expect(deck.map((c) => c.id)).toEqual(before);
  });

  it("gives the same order for the same seed and a different one for another", () => {
    const first = shuffle(deck, createSeededRng(42)).map((c) => c.id);
    const second = shuffle(deck, createSeededRng(42)).map((c) => c.id);
    const other = shuffle(deck, createSeededRng(43)).map((c) => c.id);
    expect(first).toEqual(second);
    expect(first).not.toEqual(other);
  });

  it("actually reorders the deck", () => {
    const shuffled = shuffle(deck, createSeededRng(7)).map((c) => c.id);
    expect(shuffled).not.toEqual(deck.map((c) => c.id));
  });
});
