import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  createGame,
  createSeededRng,
  getPlayerView,
  type GameEvent,
  type GameUpdate,
} from "@golf/shared";
import { GameAnimator } from "./useGameAnimation";

const game = createGame(DEFAULT_SETTINGS, ["a", "b"], createSeededRng(5));

function update(events: GameEvent[]): GameUpdate {
  return {
    view: getPlayerView(game, "a"),
    events,
    serverTime: 0,
    nextHoleAt: null,
    result: null,
  };
}
const dealt = () => update([{ type: "holeStarted", hole: 1, dealerId: "a" }]);

/** A browser that can animate, where every animation ends at once. */
function fakeBrowser() {
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: () => ({ finished: Promise.resolve(), cancel: () => undefined }),
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
}

describe("GameAnimator", () => {
  let layer: HTMLDivElement;
  beforeEach(() => {
    layer = document.createElement("div");
    document.body.append(layer);
    for (const key of ["deck", "discard"]) {
      const el = document.createElement("div");
      el.dataset.anchor = key;
      document.body.append(el);
    }
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("shows an update at once when the browser cannot animate", () => {
    const animator = new GameAnimator();
    animator.attach(layer);
    const u = dealt();
    animator.receive(u, 1);
    const state = animator.getSnapshot();
    expect(state.game).toBe(u);
    expect(state.job).toBeNull();
    expect(state.hold.anchors.size).toBe(0);
  });

  it("shows an update at once when it has nothing to act out", () => {
    fakeBrowser();
    const animator = new GameAnimator();
    animator.attach(layer);
    const u = update([]);
    animator.receive(u, 1);
    expect(animator.getSnapshot().game).toBe(u);
    expect(animator.getSnapshot().job).toBeNull();
  });

  it("hides the places cards fly to, then clears them when done", async () => {
    fakeBrowser();
    const animator = new GameAnimator();
    animator.attach(layer);
    const u = dealt();
    animator.receive(u, 1);

    const { job, hold } = animator.getSnapshot();
    expect(animator.getSnapshot().game).toBe(u);
    expect(job).not.toBeNull();
    expect(hold.anchors.size).toBe(12);
    expect(hold.discard).toBe("empty");

    await animator.play(job!);
    const done = animator.getSnapshot();
    expect(done.job).toBeNull();
    expect(done.hold.anchors.size).toBe(0);
    expect(done.hold.discard).toBeUndefined();
    expect(done.hold.deckExtra).toBe(0);
  });

  it("waits for one update to finish before showing the next", async () => {
    fakeBrowser();
    const animator = new GameAnimator();
    animator.attach(layer);
    const first = dealt();
    const second = update([]);
    animator.receive(first, 1);
    animator.receive(second, 2);
    expect(animator.getSnapshot().game).toBe(first);

    await animator.play(animator.getSnapshot().job!);
    expect(animator.getSnapshot().game).toBe(second);
  });

  it("skips ahead when too many updates pile up", async () => {
    fakeBrowser();
    const animator = new GameAnimator();
    animator.attach(layer);
    animator.receive(dealt(), 1);
    const waiting = [update([]), update([]), update([]), update([])];
    waiting.forEach((u, i) => animator.receive(u, i + 2));

    await animator.play(animator.getSnapshot().job!);
    // Straight to the newest, not one at a time.
    expect(animator.getSnapshot().game).toBe(waiting.at(-1));
    expect(animator.getSnapshot().gameAt).toBe(5);
  });

  it("forgets everything when the game goes away", () => {
    const animator = new GameAnimator();
    animator.attach(layer);
    animator.receive(dealt(), 1);
    animator.receive(null, null);
    expect(animator.getSnapshot().game).toBeNull();
    const again = dealt();
    animator.receive(again, 2);
    expect(animator.getSnapshot().game).toBe(again);
  });
});
