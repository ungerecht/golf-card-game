// Turns what just happened into a list of card movements. Pure: no DOM here,
// so the whole choreography can be tested without a browser.
import type {
  Card,
  DrawSource,
  GameEvent,
  GameView,
  PlayerId,
  SlotIndex,
} from "@golf/shared";
import type { CardFace } from "../screens/table/CardSprite";
import {
  DEAL_FLIGHT_MS,
  DEAL_STAGGER_MS,
  DEAL_TOTAL_MS,
  FLIGHT_MS,
  FLIP_MS,
  REVEAL_STAGGER_MS,
} from "./timing";

/** A place on the table a card can be, found in the page by its key. */
export type Anchor =
  | { readonly kind: "deck" }
  | { readonly kind: "discard" }
  | {
      readonly kind: "slot";
      readonly playerId: PlayerId;
      readonly slot: SlotIndex;
    }
  | {
      readonly kind: "held";
      readonly playerId: PlayerId;
      readonly source: DrawSource;
    };

export function anchorKey(anchor: Anchor): string {
  switch (anchor.kind) {
    case "deck":
    case "discard":
      return anchor.kind;
    case "slot":
      return `slot:${anchor.playerId}:${anchor.slot}`;
    case "held":
      return `held:${anchor.playerId}:${anchor.source}`;
  }
}

/** One card going from one place to another, perhaps turning over on arrival. */
export interface Move {
  readonly from: Anchor;
  /** The same as `from` for a card that turns over where it lies. */
  readonly to: Anchor;
  /** What the card shows while it travels. */
  readonly face: Card | "back";
  /** Turn over to show this once it arrives. Only for a card that left face down. */
  readonly flipTo?: Card;
  /** Wait this long after the step begins. */
  readonly delay: number;
  /** Zero for a card that does not travel. */
  readonly flight: number;
  readonly flip: number;
}

export type Step =
  | { readonly type: "shuffle" }
  /** Moves that run together. The step ends when the last one lands. */
  | { readonly type: "moves"; readonly moves: readonly Move[] };

/**
 * What to hide while a plan plays. The view already shows where everything
 * ends up, so the places a card is still travelling to are hidden until it
 * lands, and the piles show what they held before.
 */
export interface Hold {
  /** Keys of anchors that are not drawn yet. */
  readonly anchors: ReadonlySet<string>;
  /** What the discard pile shows until a card lands on it. */
  readonly discard: CardFace | undefined;
  /** Cards still to leave the deck, added to its count. */
  readonly deckExtra: number;
}

export const NO_HOLD: Hold = {
  anchors: new Set(),
  discard: undefined,
  deckExtra: 0,
};

export interface Plan {
  readonly steps: readonly Step[];
  readonly hold: Hold;
}

export const NO_PLAN: Plan = { steps: [], hold: NO_HOLD };

const SLOTS_PER_HAND = 6;

function slotAnchor(playerId: PlayerId, slot: SlotIndex): Anchor {
  return { kind: "slot", playerId, slot };
}

function flipInPlace(anchor: Anchor, card: Card, delay = 0): Move {
  return {
    from: anchor,
    to: anchor,
    face: "back",
    flipTo: card,
    delay,
    flight: 0,
    flip: FLIP_MS,
  };
}

/** A move that ends by turning over when the viewer did not know the card. */
function travel(
  from: Anchor,
  to: Anchor,
  card: Card,
  known: boolean,
  delay = 0,
): Move {
  return known
    ? { from, to, face: card, delay, flight: FLIGHT_MS, flip: 0 }
    : {
        from,
        to,
        face: "back",
        flipTo: card,
        delay,
        flight: FLIGHT_MS,
        flip: FLIP_MS,
      };
}

/** Shuffle, deal one card at a time round the table, then turn up the starter. */
function dealSteps(view: GameView, dealerId: PlayerId): Step[] {
  const seats = view.players.length;
  const dealer = view.players.findIndex((p) => p.id === dealerId);
  if (dealer < 0) return [];

  const stagger = Math.min(
    DEAL_STAGGER_MS,
    DEAL_TOTAL_MS / (seats * SLOTS_PER_HAND),
  );
  const moves: Move[] = [];
  for (let slot = 0; slot < SLOTS_PER_HAND; slot++) {
    for (let offset = 1; offset <= seats; offset++) {
      const player = view.players[(dealer + offset) % seats];
      if (player === undefined) continue;
      moves.push({
        from: { kind: "deck" },
        to: slotAnchor(player.id, slot as SlotIndex),
        face: "back",
        delay: moves.length * stagger,
        flight: DEAL_FLIGHT_MS,
        flip: 0,
      });
    }
  }

  const steps: Step[] = [{ type: "shuffle" }, { type: "moves", moves }];
  if (view.discardTop !== null) {
    steps.push({
      type: "moves",
      moves: [
        travel({ kind: "deck" }, { kind: "discard" }, view.discardTop, false),
      ],
    });
  }
  return steps;
}

/** Work out what is hidden at the start, from the moves themselves. */
function holdFor(
  steps: readonly Step[],
  prev: GameView | null,
  dealing: boolean,
): Hold {
  const anchors = new Set<string>();
  let toDiscard = false;
  let deckExtra = 0;
  for (const step of steps) {
    if (step.type !== "moves") continue;
    for (const move of step.moves) {
      if (move.to.kind === "slot" || move.to.kind === "held") {
        anchors.add(anchorKey(move.to));
      }
      if (move.to.kind === "discard") toDiscard = true;
      if (move.from.kind === "deck") deckExtra += 1;
    }
  }
  return {
    anchors,
    discard: toDiscard
      ? dealing
        ? "empty"
        : (prev?.discardTop ?? "empty")
      : undefined,
    deckExtra,
  };
}

/**
 * The animation for one update from the server.
 *
 * `prev` is the view that was on screen before it. It tells us what the viewer
 * already knew: a card drawn from the deck is only known to whoever drew it,
 * so everyone else sees it travel face down and turn over when it is placed.
 */
export function planUpdate(
  prev: GameView | null,
  update: { readonly view: GameView; readonly events: readonly GameEvent[] },
): Plan {
  const { view, events } = update;
  const steps: Step[] = [];
  let dealing = false;

  // Which slots the viewer has seen face up, kept up to date as events pass.
  const faceUp = new Map<string, boolean>();
  for (const player of prev?.players ?? []) {
    player.grid.forEach((slot, index) => {
      faceUp.set(
        anchorKey(slotAnchor(player.id, index as SlotIndex)),
        slot.faceUp,
      );
    });
  }
  // The card in someone's hand, if there is one, and whether the viewer knew it.
  let held: { source: DrawSource; known: boolean } | null =
    prev?.phase.type === "place"
      ? { source: prev.phase.source, known: prev.phase.drawn !== null }
      : null;

  const push = (...moves: Move[]) => steps.push({ type: "moves", moves });

  for (const event of events) {
    switch (event.type) {
      case "holeStarted":
        dealing = true;
        steps.push(...dealSteps(view, event.dealerId));
        break;

      case "deckReshuffled":
        steps.push({ type: "shuffle" });
        break;

      case "flipped": {
        const anchor = slotAnchor(event.playerId, event.slot);
        faceUp.set(anchorKey(anchor), true);
        push(flipInPlace(anchor, event.card));
        break;
      }

      case "drewFromDeck": {
        const known = event.playerId === view.viewerId;
        held = { source: "deck", known };
        const drawn = view.phase.type === "place" ? view.phase.drawn : null;
        const to: Anchor = {
          kind: "held",
          playerId: event.playerId,
          source: "deck",
        };
        // Only the player holding it ever gets to see the card turn over.
        push(
          known && drawn !== null
            ? travel({ kind: "deck" }, to, drawn, false)
            : {
                from: { kind: "deck" },
                to,
                face: "back",
                delay: 0,
                flight: FLIGHT_MS,
                flip: 0,
              },
        );
        break;
      }

      case "drewFromDiscard":
        held = { source: "discard", known: true };
        push(
          travel(
            { kind: "discard" },
            { kind: "held", playerId: event.playerId, source: "discard" },
            event.card,
            true,
          ),
        );
        break;

      case "swapped": {
        if (held === null) break;
        const slot = slotAnchor(event.playerId, event.slot);
        const wasUp = faceUp.get(anchorKey(slot)) === true;
        const from: Anchor = {
          kind: "held",
          playerId: event.playerId,
          source: held.source,
        };
        push(travel(from, slot, event.placed, held.known));
        // The card it replaced goes to the discard pile once the new one is down.
        push(travel(slot, { kind: "discard" }, event.replaced, wasUp));
        faceUp.set(anchorKey(slot), true);
        held = null;
        break;
      }

      case "discarded": {
        if (held === null) break;
        push(
          travel(
            { kind: "held", playerId: event.playerId, source: held.source },
            { kind: "discard" },
            event.card,
            held.known,
          ),
        );
        held = null;
        break;
      }

      case "wentOut": {
        // Everyone else's face-down cards turn over together.
        const moves = event.revealed.map((r, i) => {
          const anchor = slotAnchor(r.playerId, r.slot);
          faceUp.set(anchorKey(anchor), true);
          return flipInPlace(anchor, r.card, i * REVEAL_STAGGER_MS);
        });
        if (moves.length > 0) push(...moves);
        break;
      }

      case "tiebreak":
      case "firstPlayerChosen":
      case "turnStarted":
      case "holeScored":
      case "gameOver":
        break;
    }
  }

  if (steps.length === 0) return NO_PLAN;
  return { steps, hold: holdFor(steps, prev, dealing) };
}
