import type { Action, GameView } from "@golf/shared";
import { selectionUrl } from "../../cards";
import { CardButton } from "./CardButton";
import { CardSprite, type CardFace } from "./CardSprite";
import type { ClickTargets } from "./targets";

/**
 * The draw pile and the discard pile. While someone holds a card, the pile
 * they took it from is highlighted, so everyone can see what they did without
 * seeing the card.
 */
export function Piles({
  view,
  targets,
  onAct,
}: {
  view: GameView;
  targets: ClickTargets;
  onAct: (action: Action) => void;
}) {
  const source = view.phase.type === "place" ? view.phase.source : null;

  const pile = (face: CardFace, action: Action | null, highlighted: boolean) =>
    action === null ? (
      <div className="frame">
        <CardSprite face={face} />
        {highlighted && (
          <img
            className="selection on"
            src={selectionUrl()}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        )}
      </div>
    ) : (
      <CardButton face={face} action={action} onAct={onAct} />
    );

  return (
    <div className="piles" role="group" aria-label="Piles">
      <figure className="pile" data-active={source === "deck"}>
        {pile(
          view.deckCount > 0 ? "back" : "empty",
          targets.draw,
          source === "deck",
        )}
        <figcaption>Draw ({view.deckCount})</figcaption>
      </figure>
      <figure className="pile" data-active={source === "discard"}>
        {pile(
          view.discardTop ?? "empty",
          targets.discard,
          source === "discard",
        )}
        <figcaption>Discard</figcaption>
      </figure>
    </div>
  );
}
