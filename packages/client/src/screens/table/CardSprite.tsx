import type { Card } from "@golf/shared";
import {
  cardBackUrl,
  cardLabel,
  cardUrl,
  emptySlotUrl,
  type CardSize,
} from "../../cards";

export type CardFace = Card | "back" | "empty";

/**
 * One card. The art is 40x56 (full) or 20x28 (mini), drawn at a whole number
 * of art pixels per pixel, so it stays crisp.
 */
export function CardSprite({ face, size }: { face: CardFace; size: CardSize }) {
  const [src, alt] =
    face === "back"
      ? [cardBackUrl(size), "Face-down card"]
      : face === "empty"
        ? [emptySlotUrl(size), "Empty spot"]
        : [cardUrl(face, size), cardLabel(face)];
  return (
    <img className={`card ${size}`} src={src} alt={alt} draggable={false} />
  );
}
