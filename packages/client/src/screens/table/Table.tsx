import type { Action, GameView, LobbySnapshot } from "@golf/shared";
import { Piles } from "./Piles";
import { Seat } from "./Seat";
import { arrangeSeats } from "./seats";
import { statusText } from "./status";
import { clickTargets } from "./targets";

/** The whole table, as one player sees it: them at the bottom, the piles in the middle. */
export function Table({
  view,
  lobby,
  onAct,
}: {
  view: GameView;
  lobby: LobbySnapshot;
  /** Called with the action a click asks for. */
  onAct: (action: Action) => void;
}) {
  const info = new Map(lobby.players.map((p) => [p.id, p]));
  const nameOf = (id: string) => info.get(id)?.name ?? "Player";
  const targets = clickTargets(view);
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
            actions={player.id === view.viewerId ? targets.slots : undefined}
            onAct={onAct}
          />
        ))}
        <Piles
          view={view}
          holderName={nameOf(view.currentPlayerId)}
          targets={targets}
          onAct={onAct}
        />
      </div>
    </div>
  );
}
