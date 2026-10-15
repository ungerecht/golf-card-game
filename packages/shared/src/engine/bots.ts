// Bot players. A bot only ever sees a GameView, exactly what a human at the
// same seat would see, so it cannot cheat by reading the deck or face-down cards.
import type { Action } from "./actions";
import type { Card } from "./cards";
import type { Rng } from "./rng";
import { cardValue, columnScore } from "./scoring";
import type { GameSettings } from "./settings";
import { GRID_COLUMNS, SLOT_INDEXES, type SlotIndex } from "./state";
import type { GameView } from "./views";

/** Matches the host's `botDifficulty` setting. */
export type BotLevel = GameSettings["botDifficulty"];

/**
 * A face-down card is worth this much on average: the mean of A to Q (1 to 12)
 * and a king (0) is 78 / 13 = 6.
 */
const UNKNOWN_VALUE = 6;

/** Take the top discard if it improves the grid by at least this much. */
const TAKE_DISCARD_GAIN = 2;

/** Swap a card drawn from the deck in if it improves the grid by at least this much. */
const KEEP_DRAWN_GAIN = 1;

type KnownGrid = readonly (Card | null)[];

function expectedScore(grid: KnownGrid): number {
  let total = 0;
  for (const [top, bottom] of GRID_COLUMNS) {
    const upper = grid[top] ?? null;
    const lower = grid[bottom] ?? null;
    if (upper !== null && lower !== null) {
      total += columnScore(upper, lower);
    } else {
      total +=
        (upper === null ? UNKNOWN_VALUE : cardValue(upper)) +
        (lower === null ? UNKNOWN_VALUE : cardValue(lower));
    }
  }
  return total;
}

/** How much lower the expected score gets if `card` replaces whatever is in `slot`. */
function swapGain(grid: KnownGrid, slot: SlotIndex, card: Card): number {
  const after = grid.map((existing, i) => (i === slot ? card : existing));
  return expectedScore(grid) - expectedScore(after);
}

function bestSwap(
  grid: KnownGrid,
  card: Card,
): { slot: SlotIndex; gain: number } {
  let best = { slot: SLOT_INDEXES[0] as SlotIndex, gain: -Infinity };
  for (const slot of SLOT_INDEXES) {
    const gain = swapGain(grid, slot, card);
    if (gain > best.gain) best = { slot, gain };
  }
  return best;
}

function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Choose what a bot does next, or `null` when it has nothing to do (not its
 * turn, or the game is over).
 *
 * Bots never start the next hole. Whoever runs the room should do that, so
 * people get time to look at the scores.
 *
 * - "easy" picks any legal action at random.
 * - "normal" estimates its score, treating face-down cards as worth 6. It takes
 *   the top discard when that clearly helps, otherwise draws from the deck, and
 *   keeps a drawn card only when it improves the grid.
 */
export function chooseAction(
  view: GameView,
  rng: Rng,
  level: BotLevel = "normal",
): Action | null {
  const legal = view.legalActions.filter((a) => a.type !== "startNextHole");
  if (legal.length === 0) return null;
  if (level === "easy") return pick(legal, rng) ?? null;
  return chooseNormal(view, legal, rng);
}

function chooseNormal(
  view: GameView,
  legal: readonly Action[],
  rng: Rng,
): Action | null {
  const can = (type: Action["type"]) => legal.some((a) => a.type === type);
  const me = view.players.find((p) => p.id === view.viewerId);
  if (me === undefined) return null;
  const grid: KnownGrid = me.grid.map((slot) =>
    slot.faceUp ? slot.card : null,
  );

  switch (view.phase.type) {
    case "initialFlip":
      return (
        pick(
          legal.filter((a) => a.type === "flipInitial"),
          rng,
        ) ?? null
      );

    case "flipOrDraw": {
      if (view.discardTop !== null && can("drawFromDiscard")) {
        if (bestSwap(grid, view.discardTop).gain >= TAKE_DISCARD_GAIN) {
          return { type: "drawFromDiscard" };
        }
      }
      if (can("drawFromDeck")) return { type: "drawFromDeck" };
      const flips = legal.filter((a) => a.type === "flip");
      if (flips.length > 0) return pick(flips, rng) ?? null;
      return can("drawFromDiscard") ? { type: "drawFromDiscard" } : null;
    }

    case "place": {
      const { drawn } = view.phase;
      if (drawn === null) return null;
      const { slot, gain } = bestSwap(grid, drawn);
      if (can("discardDrawn") && gain < KEEP_DRAWN_GAIN) {
        return { type: "discardDrawn" };
      }
      return { type: "swapDrawn", slot };
    }

    default:
      return null;
  }
}
