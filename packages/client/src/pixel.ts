import { useEffect } from "react";

/** The screen width, in art pixels, that the layout is designed around. */
export const ART_WIDTH = 360;

/**
 * How big one art pixel is, in CSS pixels. It is always a whole number of
 * device pixels, so pixel art never gets blurry or uneven.
 */
export function pixelSize(cssWidth: number, devicePixelRatio: number): number {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const devicePixels = Math.max(1, Math.floor((cssWidth * ratio) / ART_WIDTH));
  return devicePixels / ratio;
}

/**
 * How many times bigger the cards you play with are drawn. On a phone an art
 * pixel is about one CSS pixel, which makes a card a thumbnail, so they are
 * drawn at double size there.
 */
export function handScale(px: number): 1 | 2 {
  return px < 2 ? 2 : 1;
}

/** Keeps `--px` and `--hand-scale` on the page up to date. Everything pixel-sized is a multiple of `--px`. */
export function usePixelScale(): void {
  useEffect(() => {
    const update = () => {
      const px = pixelSize(window.innerWidth, window.devicePixelRatio);
      const style = document.documentElement.style;
      style.setProperty("--px", `${px}px`);
      style.setProperty("--hand-scale", String(handScale(px)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
}
