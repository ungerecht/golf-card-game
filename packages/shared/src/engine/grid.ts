import type { Card } from "./cards";
import {
  SLOT_INDEXES,
  type Grid,
  type GridCard,
  type SlotIndex,
} from "./state";

/** Build a grid from exactly six cards, laid out row by row (see state.ts). */
export function toGrid(cards: readonly Card[], faceUp = false): Grid {
  if (cards.length !== SLOT_INDEXES.length) {
    throw new Error(
      `A grid needs ${SLOT_INDEXES.length} cards, got ${cards.length}`,
    );
  }
  return cards.map((card) => ({ card, faceUp })) as unknown as Grid;
}

/** Returns a new grid with one slot replaced. */
export function setSlot(grid: Grid, slot: SlotIndex, value: GridCard): Grid {
  return grid.map((current, index) =>
    index === slot ? value : current,
  ) as unknown as Grid;
}

/** Returns a new grid with every card face up. */
export function revealAll(grid: Grid): Grid {
  return grid.map((gridCard) =>
    gridCard.faceUp ? gridCard : { card: gridCard.card, faceUp: true },
  ) as unknown as Grid;
}

export function faceUpCount(grid: Grid): number {
  return grid.filter((gridCard) => gridCard.faceUp).length;
}

export function isFullyFaceUp(grid: Grid): boolean {
  return faceUpCount(grid) === SLOT_INDEXES.length;
}

export function faceDownSlots(grid: Grid): SlotIndex[] {
  return SLOT_INDEXES.filter((slot) => !grid[slot].faceUp);
}
