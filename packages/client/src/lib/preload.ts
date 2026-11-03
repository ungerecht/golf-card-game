// Held for the life of the page. A browser may drop a decoded image nothing
// refers to, which would put the delay back the next time it is drawn.
const kept: HTMLImageElement[] = [];

/**
 * Fetch and decode images ahead of time, so they paint with the first frame
 * that uses them instead of popping in a moment later. Never rejects: an image
 * that fails to preload still loads normally when it is drawn.
 */
export function preloadImages(urls: readonly string[]): Promise<void> {
  const loads = urls.map((url) => {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    kept.push(img);
    // decode() is missing in some test environments.
    return typeof img.decode === "function"
      ? img.decode().catch(() => undefined)
      : Promise.resolve();
  });
  return Promise.all(loads).then(() => undefined);
}
