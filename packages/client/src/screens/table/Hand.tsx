import type { SlotView } from "@golf/shared";
import type { CardSize } from "../../cards";
import { CardSprite } from "./CardSprite";

/** Six cards, three across and two down, as they lie on the table. */
export function Hand({
  grid,
  size,
}: {
  grid: readonly SlotView[];
  size: CardSize;
}) {
  return (
    <div className={`hand ${size}`} role="group" aria-label="Cards">
      {grid.map((slot, index) => (
        <CardSprite
          key={slot.faceUp ? slot.card.id : `down-${index}`}
          face={slot.faceUp ? slot.card : "back"}
          size={size}
        />
      ))}
    </div>
  );
}
