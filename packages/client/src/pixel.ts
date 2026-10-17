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

/** Keeps `--px` on the page up to date. Everything pixel-sized is a multiple of it. */
export function usePixelScale(): void {
  useEffect(() => {
    const update = () => {
      document.documentElement.style.setProperty(
        "--px",
        `${pixelSize(window.innerWidth, window.devicePixelRatio)}px`,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
}
