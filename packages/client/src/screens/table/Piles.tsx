import type { Action, GameView } from "@golf/shared";
import { selectionUrl } from "../../cards";
import { CardButton } from "./CardButton";
import { NO_HOLD, type Hold } from "../../animation/plan";
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
  hold = NO_HOLD,
}: {
  view: GameView;
  targets: ClickTargets;
  onAct: (action: Action) => void;
  /** While cards are still flying, the piles show what they held before. */
  hold?: Hold;
}) {
  const source = view.phase.type === "place" ? view.phase.source : null;

  const deckCount = view.deckCount + hold.deckExtra;
  const discardFace: CardFace =
    hold.discard !== undefined ? hold.discard : (view.discardTop ?? "empty");

  const pile = (
    anchor: string,
    face: CardFace,
    action: Action | null,
    highlighted: boolean,
  ) =>
    action === null ? (
      <div className="frame" data-anchor={anchor}>
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
      <CardButton face={face} action={action} onAct={onAct} anchor={anchor} />
    );

  return (
    <div className="piles" role="group" aria-label="Piles">
      <figure className="pile" data-active={source === "deck"}>
        {pile(
          "deck",
          deckCount > 0 ? "back" : "empty",
          targets.draw,
          source === "deck",
        )}
        <figcaption>Draw ({deckCount})</figcaption>
      </figure>
      <figure className="pile" data-active={source === "discard"}>
        {pile("discard", discardFace, targets.discard, source === "discard")}
        <figcaption>Discard</figcaption>
      </figure>
    </div>
  );
}
