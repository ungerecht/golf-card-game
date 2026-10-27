import type { Action, PlayerId, SlotIndex, SlotView } from "@golf/shared";
import { anchorKey, type Hold } from "../../animation/plan";
import { CardButton } from "./CardButton";
import { CardSprite } from "./CardSprite";

/** Six cards, three across and two down, as they lie on the table. */
export function Hand({
  playerId,
  grid,
  actions,
  onAct,
  hold,
}: {
  playerId: PlayerId;
  grid: readonly SlotView[];
  /** What clicking each slot does. Slots without an action cannot be clicked. */
  actions?: ReadonlyMap<SlotIndex, Action>;
  onAct?: (action: Action) => void;
  /** Cards still flying in are not drawn yet. */
  hold?: Hold;
}) {
  return (
    <div className="hand" role="group" aria-label="Cards">
      {grid.map((slot, index) => {
        const face = slot.faceUp ? slot.card : "back";
        const key = slot.faceUp ? slot.card.id : `down-${index}`;
        const action = actions?.get(index as SlotIndex);
        const anchor = anchorKey({
          kind: "slot",
          playerId,
          slot: index as SlotIndex,
        });
        const hidden = hold?.anchors.has(anchor) ?? false;
        return action !== undefined && onAct !== undefined ? (
          <CardButton
            key={key}
            face={face}
            action={action}
            onAct={onAct}
            anchor={anchor}
            hidden={hidden}
          />
        ) : (
          <CardSprite key={key} face={face} anchor={anchor} hidden={hidden} />
        );
      })}
    </div>
  );
}
