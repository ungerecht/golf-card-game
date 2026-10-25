import type { Action, SlotIndex, SlotView } from "@golf/shared";
import { CardButton } from "./CardButton";
import { CardSprite } from "./CardSprite";

/** Six cards, three across and two down, as they lie on the table. */
export function Hand({
  grid,
  actions,
  onAct,
}: {
  grid: readonly SlotView[];
  /** What clicking each slot does. Slots without an action cannot be clicked. */
  actions?: ReadonlyMap<SlotIndex, Action>;
  onAct?: (action: Action) => void;
}) {
  return (
    <div className="hand" role="group" aria-label="Cards">
      {grid.map((slot, index) => {
        const face = slot.faceUp ? slot.card : "back";
        const key = slot.faceUp ? slot.card.id : `down-${index}`;
        const action = actions?.get(index as SlotIndex);
        return action !== undefined && onAct !== undefined ? (
          <CardButton key={key} face={face} action={action} onAct={onAct} />
        ) : (
          <CardSprite key={key} face={face} />
        );
      })}
    </div>
  );
}
