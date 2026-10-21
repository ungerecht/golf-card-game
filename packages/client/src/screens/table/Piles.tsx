import type { Action, GameView } from "@golf/shared";
import { CardButton } from "./CardButton";
import { CardSprite, type CardFace } from "./CardSprite";
import type { ClickTargets } from "./targets";

/** The draw pile, the discard pile, and the card someone is holding while they place it. */
export function Piles({
  view,
  holderName,
  targets,
  onAct,
}: {
  view: GameView;
  holderName: string;
  targets: ClickTargets;
  onAct: (action: Action) => void;
}) {
  const holding = view.phase.type === "place" ? view.phase : null;
  const drawFace: CardFace = view.deckCount > 0 ? "back" : "empty";
  const discardFace: CardFace = view.discardTop ?? "empty";

  const pile = (face: CardFace, action: Action | null) =>
    action === null ? (
      <CardSprite face={face} size="full" />
    ) : (
      <CardButton face={face} size="full" action={action} onAct={onAct} />
    );

  return (
    <div className="piles" role="group" aria-label="Piles">
      <figure className="pile">
        {pile(drawFace, targets.draw)}
        <figcaption>Draw ({view.deckCount})</figcaption>
      </figure>
      <figure className="pile">
        {pile(discardFace, targets.discard)}
        <figcaption>Discard</figcaption>
      </figure>
      {holding !== null && (
        <figure className="pile">
          <CardSprite face={holding.drawn ?? "back"} size="full" />
          <figcaption>{holderName} holds</figcaption>
        </figure>
      )}
    </div>
  );
}
