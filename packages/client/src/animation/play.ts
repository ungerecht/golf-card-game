// Draws the moves of a plan on an overlay, using the browser's own animations.
// The real table never moves: cards fly over the top, and the place they are
// flying to stays hidden (see Hold) until they land.
import { cardBackUrl, cardUrl } from "../cards";
import type { Move } from "./plan";
import { SHUFFLE_PASSES, SHUFFLE_PASS_MS } from "./timing";

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function boxOf(rect: DOMRect): Box {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Whether this browser can animate, and the player has not asked for less motion. */
export function canAnimate(): boolean {
  if (typeof Element === "undefined" || !("animate" in Element.prototype)) {
    return false;
  }
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return !reduced;
}

export interface Playback {
  /** 2 plays everything twice as fast, to catch up when updates pile up. */
  readonly speed: number;
  readonly cancelled: () => boolean;
}

const EASE_OUT = "cubic-bezier(0.25, 0.8, 0.3, 1)";
const EASE_IN_OUT = "ease-in-out";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Resolve when the animation ends, or soon after it should have. */
function ended(animation: Animation, ms: number): Promise<void> {
  return Promise.race([
    animation.finished.then(
      () => undefined,
      () => undefined,
    ),
    // Background tabs pause animations. Do not wait forever for them.
    wait(ms + 400),
  ]);
}

function image(src: string, className: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.draggable = false;
  img.className = className;
  return img;
}

function cardElement(box: Box, className = "fx-card"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  return el;
}

/**
 * Fly one card from `from` to `to`. If it left face down and has a face to
 * show, it turns over once it arrives. Resolves when it is done and gone.
 */
export async function playMove(
  layer: HTMLElement,
  move: Move,
  from: Box,
  to: Box,
  playback: Playback,
  /** Called the moment the card appears, after any delay. */
  onLaunch: () => void,
): Promise<void> {
  await wait(move.delay / playback.speed);
  if (playback.cancelled()) return;
  onLaunch();

  const el = cardElement(from);
  const inner = document.createElement("div");
  inner.className = "fx-inner";
  if (move.flipTo !== undefined) {
    // The back is what we see first. The face waits behind it, turned away.
    inner.append(
      image(cardBackUrl(), "fx-face"),
      image(cardUrl(move.flipTo), "fx-face fx-front"),
    );
  } else {
    const src = move.face === "back" ? cardBackUrl() : cardUrl(move.face);
    inner.append(image(src, "fx-face fx-only"));
  }
  el.append(inner);
  layer.append(el);

  const animations: Animation[] = [];
  try {
    if (move.flight > 0) {
      const scale = to.width / from.width;
      const flight = el.animate(
        [
          { transform: "translate(0px, 0px) scale(1)" },
          {
            transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`,
          },
        ],
        {
          duration: move.flight / playback.speed,
          easing: EASE_OUT,
          fill: "forwards",
        },
      );
      animations.push(flight);
      await ended(flight, move.flight / playback.speed);
    }

    if (move.flipTo !== undefined && !playback.cancelled()) {
      const duration = move.flip / playback.speed;
      const turn = inner.animate(
        [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
        { duration, easing: EASE_IN_OUT, fill: "forwards" },
      );
      animations.push(turn);
      // A card that stays put lifts a little as it turns, so the flip reads.
      if (move.flight === 0) {
        animations.push(
          el.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.12)", offset: 0.5 },
              { transform: "scale(1)" },
            ],
            { duration, easing: EASE_IN_OUT },
          ),
        );
      }
      await ended(turn, duration);
    }
  } finally {
    for (const animation of animations) animation.cancel();
    el.remove();
  }
}

/** The deck riffles: cards slide apart and back together, a few at a time. */
export async function playShuffle(
  layer: HTMLElement,
  deck: Box,
  playback: Playback,
): Promise<void> {
  const cards = 6;
  const pass = SHUFFLE_PASS_MS / playback.speed;
  const stagger = pass / 7;
  const made: HTMLElement[] = [];
  const animations: Animation[] = [];
  try {
    for (let i = 0; i < cards; i++) {
      const el = cardElement(deck);
      el.append(image(cardBackUrl(), "fx-face fx-only"));
      layer.append(el);
      made.push(el);
      const side = i % 2 === 0 ? -1 : 1;
      const out = `translate(${side * deck.width * 0.7}px, ${-deck.height * 0.06}px) rotate(${side * 7}deg)`;
      animations.push(
        el.animate(
          [
            { transform: "translate(0px, 0px) rotate(0deg)" },
            { transform: out, offset: 0.45 },
            { transform: "translate(0px, 0px) rotate(0deg)" },
          ],
          {
            duration: pass,
            delay: i * stagger,
            iterations: SHUFFLE_PASSES,
            easing: EASE_IN_OUT,
            fill: "both",
          },
        ),
      );
    }
    const total = pass * SHUFFLE_PASSES + cards * stagger;
    await Promise.race([
      Promise.all(
        animations.map((a) =>
          a.finished.then(
            () => undefined,
            () => undefined,
          ),
        ),
      ),
      wait(total + 400),
    ]);
  } finally {
    for (const animation of animations) animation.cancel();
    for (const el of made) el.remove();
  }
}
