import type { GameView } from "@golf/shared";

/** One line saying what the table is waiting for. */
export function statusText(
  view: GameView,
  nameOf: (playerId: string) => string,
): string {
  const { phase, viewerId } = view;
  const mine = viewerId !== null && view.currentPlayerId === viewerId;
  const current = nameOf(view.currentPlayerId);

  switch (phase.type) {
    case "initialFlip": {
      const me = view.players.find((p) => p.id === viewerId);
      const flipped = me?.grid.filter((slot) => slot.faceUp).length ?? 0;
      if (me === undefined) return "Everyone is flipping their first cards";
      return flipped < phase.flipsRequired
        ? `Flip ${phase.flipsRequired - flipped} of your cards`
        : "Waiting for everyone to flip";
    }
    case "flipOrDraw":
      return mine ? "Your turn: flip a card or draw" : `${current}'s turn`;
    case "place":
      if (!mine) return `${current} is placing a card`;
      // Only a card from the draw pile can be thrown away again.
      return phase.source === "deck"
        ? "Swap your card into your hand, or discard it"
        : "Swap your card into your hand";
    case "holeOver":
      return "Hole over";
    case "gameOver":
      return "Game over";
  }
}
