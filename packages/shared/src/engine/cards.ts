// Card type, deck builder, shuffle (takes an rng)
import type { Rng } from "./rng";

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export const STANDARD_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export type StandardRank = (typeof STANDARD_RANKS)[number];

/** `id` is unique within a game, so the client can use it as a React key and animation target. */
export interface StandardCard {
  readonly id: string;
  readonly rank: StandardRank;
  readonly suit: Suit;
}

export type Card = StandardCard;
export type Rank = Card["rank"];

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push({ id: `${rank}-${suit}`, rank, suit });
    }
  }
  return cards;
}

/** Fisher-Yates shuffle. Returns a new array and leaves the input untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
