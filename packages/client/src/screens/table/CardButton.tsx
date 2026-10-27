import type { Action } from "@golf/shared";
import { selectionUrl } from "../../cards";
import { CardSprite, type CardFace } from "./CardSprite";
import { describeAction } from "./targets";

/**
 * A card you can click. The gold outline marks it as something you can do,
 * and gets brighter under the pointer or the keyboard focus.
 */
export function CardButton({
  face,
  action,
  onAct,
  anchor,
  hidden = false,
}: {
  face: CardFace;
  action: Action;
  onAct: (action: Action) => void;
  /** Names this spot for the animations, which fly cards to and from it. */
  anchor?: string;
  /** Not drawn yet: a card is still flying here. It keeps its place. */
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      className={hidden ? "card-button is-hidden" : "card-button"}
      data-anchor={anchor}
      aria-label={describeAction(action)}
      onClick={() => onAct(action)}
    >
      <CardSprite face={face} />
      <img
        className="selection"
        src={selectionUrl()}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </button>
  );
}
