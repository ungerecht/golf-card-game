import type { ReactNode } from "react";
import type { Action, GameView, LobbySnapshot } from "@golf/shared";
import { GameMenu } from "./GameMenu";
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
  onLeave,
  banner,
  chat,
}: {
  view: GameView;
  lobby: LobbySnapshot;
  /** Called with the action a click asks for. */
  onAct: (action: Action) => void;
  /** Called once the player has confirmed they want to leave. */
  onLeave: () => void;
  /** Something to show under the status bar, like a way back to the results. */
  banner?: ReactNode;
  /** Room chat, shown under the status bar. */
  chat?: ReactNode;
}) {
  const info = new Map(lobby.players.map((p) => [p.id, p]));
  const nameOf = (id: string) => info.get(id)?.name ?? "Player";
  const targets = clickTargets(view);
  const seats = arrangeSeats(view.players, view.viewerId);

  return (
    <div className="table-wrap">
      <div className="topbar">
        <GameMenu view={view} lobby={lobby} onLeave={onLeave} />
        <p className="panel status" role="status">
          <span>
            Hole {view.hole} of {view.settings.holes}
          </span>
          <strong>{statusText(view, nameOf)}</strong>
        </p>
      </div>
      {chat}
      {banner}
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
            held={
              player.id === view.viewerId && view.phase.type === "place"
                ? view.phase.drawn
                : null
            }
            actions={player.id === view.viewerId ? targets.slots : undefined}
            onAct={onAct}
          />
        ))}
        <Piles view={view} targets={targets} onAct={onAct} />
      </div>
    </div>
  );
}
