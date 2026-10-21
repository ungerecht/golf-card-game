import type { Action, GameView, SlotIndex } from "@golf/shared";

/** What can be clicked right now, and what clicking it does. */
export interface ClickTargets {
  /** The action for each of your own cards, by slot. A missing slot is not clickable. */
  readonly slots: ReadonlyMap<SlotIndex, Action>;
  /** Clicking the draw pile. */
  readonly draw: Action | null;
  /** Clicking the discard pile: take its top card, or throw away the card you drew. */
  readonly discard: Action | null;
}

/**
 * Work out what each part of the table does, from the actions the server says
 * are legal. The client never decides what is allowed.
 */
export function clickTargets(view: GameView): ClickTargets {
  const slots = new Map<SlotIndex, Action>();
  let draw: Action | null = null;
  let discard: Action | null = null;

  for (const action of view.legalActions) {
    switch (action.type) {
      case "flipInitial":
      case "flip":
      case "swapDrawn":
        slots.set(action.slot, action);
        break;
      case "drawFromDeck":
        draw = action;
        break;
      case "drawFromDiscard":
      case "discardDrawn":
        discard = action;
        break;
      case "startNextHole":
        break;
    }
  }
  return { slots, draw, discard };
}

const SLOT_NAMES = [
  "top left",
  "top middle",
  "top right",
  "bottom left",
  "bottom middle",
  "bottom right",
] as const;

/** Where a slot is in your hand, for labels. */
export function slotName(slot: SlotIndex): string {
  return SLOT_NAMES[slot];
}

/** What a click will do, in words. This is the button's accessible name. */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "flipInitial":
    case "flip":
      return `Flip your ${slotName(action.slot)} card`;
    case "swapDrawn":
      return `Swap into your ${slotName(action.slot)} card`;
    case "drawFromDeck":
      return "Draw from the deck";
    case "drawFromDiscard":
      return "Take the top discard";
    case "discardDrawn":
      return "Discard the card you drew";
    case "startNextHole":
      return "Start the next hole";
  }
}
