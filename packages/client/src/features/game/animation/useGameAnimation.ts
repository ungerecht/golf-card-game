// Shows the game a little behind the server, so each update can be acted out
// before the next one appears. Updates wait in a queue. For each one we:
//   1. work out the card movements (plan.ts),
//   2. show its view, with the places cards are heading for hidden,
//   3. fly the cards over the top (play.ts), unhiding each place as one lands.
// If animation is not possible (old browser, reduced motion) or the queue is
// long, the table just jumps to the newest view.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { GameUpdate } from "@golf/shared";
import {
  NO_HOLD,
  NO_PLAN,
  anchorKey,
  planUpdate,
  type Hold,
  type Move,
  type Plan,
} from "./plan";
import { boxOf, canAnimate, playMove, playShuffle, type Box } from "./play";

/** More waiting than this and we stop acting things out and catch up. */
const MAX_BACKLOG = 3;

interface Job {
  readonly plan: Plan;
  /** Where the anchors were just before this update was drawn. */
  readonly before: ReadonlyMap<string, Box>;
  /** 2 when more updates are waiting, to catch up. */
  readonly speed: number;
}

export interface AnimationState {
  /** What to draw: the latest update that has been acted out so far. */
  readonly game: GameUpdate | null;
  readonly gameAt: number | null;
  /** Places a card is still flying to. */
  readonly hold: Hold;
  /** The update on screen is waiting to be played. */
  readonly job: Job | null;
}

const START: AnimationState = {
  game: null,
  gameAt: null,
  hold: NO_HOLD,
  job: null,
};

/** Where every anchor on the page is right now. */
function measure(root: ParentNode): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-anchor]")) {
    const key = el.dataset.anchor;
    if (key !== undefined) boxes.set(key, boxOf(el.getBoundingClientRect()));
  }
  return boxes;
}

/** The queue and the clock behind useGameAnimation. */
export class GameAnimator {
  /** The empty element over the table that cards fly across. */
  layer: HTMLElement | null = null;

  attach(layer: HTMLElement | null): void {
    this.layer = layer;
  }

  #state: AnimationState = START;
  readonly #listeners = new Set<() => void>();
  #queue: { game: GameUpdate; gameAt: number | null }[] = [];
  #busy = false;
  #seen: GameUpdate | null = null;
  // Bumped to cancel whatever is playing.
  #epoch = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): AnimationState => this.#state;

  #set(patch: Partial<AnimationState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  /** The server sent a new update, or `null` when there is no game any more. */
  receive(game: GameUpdate | null, gameAt: number | null): void {
    if (game === null) {
      this.#epoch += 1;
      this.#seen = null;
      this.#queue = [];
      this.#busy = false;
      this.#set(START);
      return;
    }
    if (this.#seen === game) return;
    this.#seen = game;
    this.#queue.push({ game, gameAt });
    this.#drain();
  }

  /** Stop playing. Anything half-flown is dropped. */
  cancel(): void {
    this.#epoch += 1;
  }

  /** Show the next waiting update, and start acting it out if it has a plan. */
  #drain(): void {
    if (this.#busy) return;
    let entry = this.#queue.shift();
    if (entry === undefined) return;

    if (this.#queue.length >= MAX_BACKLOG) {
      // Too far behind to be worth watching. Skip to the newest.
      entry = this.#queue.at(-1) ?? entry;
      this.#queue = [];
      this.#set({ ...entry, hold: NO_HOLD, job: null });
      return;
    }

    const layer = this.layer;
    const plan =
      layer !== null && canAnimate()
        ? planUpdate(this.#state.game?.view ?? null, entry.game)
        : NO_PLAN;
    if (layer === null || plan === NO_PLAN) {
      this.#set({ ...entry, hold: NO_HOLD, job: null });
      // Nothing to wait for, so the next one can go straight away.
      this.#drain();
      return;
    }

    this.#busy = true;
    this.#set({
      ...entry,
      hold: plan.hold,
      job: {
        plan,
        before: measure(layer.ownerDocument),
        // Hurry if more are waiting behind this one.
        speed: this.#queue.length > 0 ? 2 : 1,
      },
    });
  }

  /** The update is on screen with its places hidden. Fly the cards in. */
  async play(job: Job): Promise<void> {
    const layer = this.layer;
    const mine = this.#epoch;
    const cancelled = () => this.#epoch !== mine;
    const playback = { speed: job.speed, cancelled };
    if (layer === null) return this.#finish(mine);

    const after = measure(layer.ownerDocument);
    const find = (key: string, preferBefore: boolean): Box | undefined =>
      preferBefore
        ? (job.before.get(key) ?? after.get(key))
        : (after.get(key) ?? job.before.get(key));

    const release = (move: Move) => {
      if (cancelled()) return;
      const key = anchorKey(move.to);
      const { hold } = this.#state;
      const anchors = new Set(hold.anchors);
      anchors.delete(key);
      this.#set({
        hold: {
          ...hold,
          anchors,
          discard: move.to.kind === "discard" ? undefined : hold.discard,
        },
      });
    };
    const leftDeck = (move: Move) => {
      if (move.from.kind !== "deck" || cancelled()) return;
      const { hold } = this.#state;
      this.#set({
        hold: { ...hold, deckExtra: Math.max(0, hold.deckExtra - 1) },
      });
    };

    try {
      for (const step of job.plan.steps) {
        if (cancelled()) return;
        if (step.type === "shuffle") {
          const deck = find("deck", false);
          if (deck !== undefined) await playShuffle(layer, deck, playback);
          continue;
        }
        await Promise.all(
          step.moves.map(async (move) => {
            const from = find(anchorKey(move.from), true);
            const to = find(anchorKey(move.to), false);
            try {
              if (from === undefined || to === undefined) return;
              await playMove(layer, move, from, to, playback, () =>
                leftDeck(move),
              );
            } finally {
              release(move);
            }
          }),
        );
      }
    } finally {
      this.#finish(mine);
    }
  }

  #finish(epoch: number): void {
    if (this.#epoch !== epoch) return;
    this.#busy = false;
    this.#set({ hold: NO_HOLD, job: null });
    this.#drain();
  }
}

export interface AnimatedGame {
  /** What to draw: the latest update that has been acted out so far. */
  readonly game: GameUpdate | null;
  readonly gameAt: number | null;
  readonly hold: Hold;
  /** Attach to an empty, fixed-position element that covers the table. */
  readonly layerRef: RefObject<HTMLDivElement | null>;
}

export function useGameAnimation(
  game: GameUpdate | null,
  gameAt: number | null,
): AnimatedGame {
  const [animator] = useState(() => new GameAnimator());
  const state = useSyncExternalStore(animator.subscribe, animator.getSnapshot);
  const layerRef = useRef<HTMLDivElement | null>(null);

  // The layer can be a different element after each render.
  useLayoutEffect(() => {
    animator.attach(layerRef.current);
  });
  useLayoutEffect(() => {
    animator.receive(game, gameAt);
  }, [animator, game, gameAt]);
  useLayoutEffect(() => {
    if (state.job !== null) void animator.play(state.job);
  }, [animator, state.job]);
  useEffect(() => () => animator.cancel(), [animator]);

  return { game: state.game, gameAt: state.gameAt, hold: state.hold, layerRef };
}
