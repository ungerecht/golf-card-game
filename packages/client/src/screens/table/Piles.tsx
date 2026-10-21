import type { GameView } from "@golf/shared";
import { CardSprite } from "./CardSprite";

/** The draw pile, the discard pile, and the card someone is holding while they place it. */
export function Piles({
  view,
  holderName,
}: {
  view: GameView;
  holderName: string;
}) {
  const holding = view.phase.type === "place" ? view.phase : null;
  return (
    <div className="piles" role="group" aria-label="Piles">
      <figure className="pile">
        <CardSprite face={view.deckCount > 0 ? "back" : "empty"} size="full" />
        <figcaption>Draw ({view.deckCount})</figcaption>
      </figure>
      <figure className="pile">
        <CardSprite face={view.discardTop ?? "empty"} size="full" />
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
