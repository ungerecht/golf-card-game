import type { ReactNode } from "react";
import type { Action, GameView, LobbySnapshot } from "@golf/shared";
import { GameMenu } from "./GameMenu";
import { Piles } from "./Piles";
import { Seat } from "./Seat";
import { arrangeSeats } from "./seats";
import { clickTargets } from "./targets";
import { Info } from "./Info";

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
  /** Something to show under the top bar, like a way back to the results. */
  banner?: ReactNode;
  /** Room chat */
  chat?: ReactNode;
}) {
  const info = new Map(lobby.players.map((p) => [p.id, p]));
  const targets = clickTargets(view);
  const seats = arrangeSeats(view.players, view.viewerId);

  return (
    <div className="table-wrap">
      <div className="topbar">
        <GameMenu view={view} lobby={lobby} onLeave={onLeave} />
        {chat}
      </div>
      {banner}
      <div className="table" data-players={view.players.length}>
        {seats.map(({ position, player }) => (
          <Seat
            key={player.id}
            position={position}
            player={player}
            info={info.get(player.id)}
            view={view}
            actions={player.id === view.viewerId ? targets.slots : undefined}
            onAct={onAct}
          />
        ))}
        <Piles view={view} targets={targets} onAct={onAct} />
      </div>
      <Info view={view} info={info} />
    </div>
  );
}
