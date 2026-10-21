import type { GameView, LobbySnapshot } from "@golf/shared";
import { Piles } from "./Piles";
import { Seat } from "./Seat";
import { arrangeSeats } from "./seats";
import { statusText } from "./status";

/** The whole table, as one player sees it: them at the bottom, the piles in the middle. */
export function Table({
  view,
  lobby,
}: {
  view: GameView;
  lobby: LobbySnapshot;
}) {
  const info = new Map(lobby.players.map((p) => [p.id, p]));
  const nameOf = (id: string) => info.get(id)?.name ?? "Player";
  const seats = arrangeSeats(view.players, view.viewerId);

  return (
    <div className="table-wrap">
      <p className="panel status" role="status">
        <span>
          Hole {view.hole} of {view.settings.holes}
        </span>
        <strong>{statusText(view, nameOf)}</strong>
      </p>
      <div className="table" data-players={view.players.length}>
        {seats.map(({ position, player }) => (
          <Seat
            key={player.id}
            position={position}
            player={player}
            info={info.get(player.id)}
            isViewer={player.id === view.viewerId}
            isCurrent={player.id === view.currentPlayerId}
            isDealer={player.id === view.dealerId}
          />
        ))}
        <Piles view={view} holderName={nameOf(view.currentPlayerId)} />
      </div>
    </div>
  );
}
