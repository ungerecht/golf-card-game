import type { Card } from "@golf/shared";
import { cardBackUrl, cardLabel, cardUrl, emptySlotUrl } from "../../cards";

export type CardFace = Card | "back" | "empty";

/**
 * One card. The art is 40x56, drawn at a whole number
 * of art pixels per pixel, so it stays crisp.
 */
export function CardSprite({
  face,
  anchor,
  hidden = false,
}: {
  face: CardFace;
  /** Names this spot for the animations, which fly cards to and from it. */
  anchor?: string;
  /** Not drawn yet: a card is still flying here. It keeps its place. */
  hidden?: boolean;
}) {
  const [src, alt] =
    face === "back"
      ? [cardBackUrl(), "Face-down card"]
      : face === "empty"
        ? [emptySlotUrl(), "Empty spot"]
        : [cardUrl(face), cardLabel(face)];
  return (
    <img
      className={hidden ? "card is-hidden" : "card"}
      data-anchor={anchor}
      src={src}
      alt={alt}
      decoding="sync"
      draggable={false}
    />
  );
}
