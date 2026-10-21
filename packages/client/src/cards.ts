import type { Card, Rank } from "@golf/shared";

/** Full cards have pips and are for the viewer's own hand. Mini cards are for everyone else. */
export type CardSize = "full" | "mini";

/** The size of each card in art pixels. Both are 5:7. */
export const CARD_ART_SIZE: Record<
  CardSize,
  { width: number; height: number }
> = {
  full: { width: 40, height: 56 },
  mini: { width: 20, height: 28 },
};

const FOLDER: Record<CardSize, string> = {
  full: "cards",
  mini: "miniCards",
};

// Every card image, keyed by its path.
const sprites = import.meta.glob<string>(
  "./assets/{cards,miniCards}/**/*.png",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

/** The file names use words for ranks: A is "ace", 10 is "ten", K is "king". */
export const RANK_WORDS: Record<Rank, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
};

function spriteUrl(size: CardSize, file: string): string {
  const path = `./assets/${FOLDER[size]}/${file}.png`;
  const url = sprites[path];
  if (url === undefined) throw new Error(`Missing card image ${path}`);
  return url;
}

/** The face of a card. */
export function cardUrl(card: Card, size: CardSize): string {
  return spriteUrl(size, `${card.suit}/${RANK_WORDS[card.rank]}`);
}

export function cardBackUrl(size: CardSize): string {
  return spriteUrl(size, "back");
}

/** Marks a spot where a card can go, like an empty discard pile. */
export function emptySlotUrl(size: CardSize): string {
  return spriteUrl(size, "empty");
}

/**
 * The outline for a chosen card. It is one art pixel bigger than the card on
 * every side, so draw it one pixel up and to the left of the card.
 */
export function selectionUrl(size: CardSize): string {
  return spriteUrl(size, "selection");
}

/** For alt text, such as "Queen of hearts". */
export function cardLabel(card: Card): string {
  const rank = RANK_WORDS[card.rank];
  return `${rank.charAt(0).toUpperCase()}${rank.slice(1)} of ${card.suit}`;
}

/** How many card images there are in all, so a test can spot a stray or missing file. */
export const CARD_IMAGE_COUNT = Object.keys(sprites).length;
