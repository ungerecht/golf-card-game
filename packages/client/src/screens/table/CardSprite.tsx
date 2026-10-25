import type { Card } from "@golf/shared";
import { cardBackUrl, cardLabel, cardUrl, emptySlotUrl } from "../../cards";

export type CardFace = Card | "back" | "empty";

/**
 * One card. The art is 40x56, drawn at a whole number
 * of art pixels per pixel, so it stays crisp.
 */
export function CardSprite({ face }: { face: CardFace }) {
  const [src, alt] =
    face === "back"
      ? [cardBackUrl(), "Face-down card"]
      : face === "empty"
        ? [emptySlotUrl(), "Empty spot"]
        : [cardUrl(face), cardLabel(face)];
  return (
    <img
      className={`card`}
      src={src}
      alt={alt}
      decoding="sync"
      draggable={false}
    />
  );
}
