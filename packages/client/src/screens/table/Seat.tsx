import type { LobbyPlayer, PlayerView } from "@golf/shared";
import { Avatar } from "../Avatar";
import { Hand } from "./Hand";
import type { SeatPosition } from "./seats";

/** A player at the table: portrait, name, and their six cards. */
export function Seat({
  position,
  player,
  info,
  isViewer,
  isCurrent,
  isDealer,
}: {
  position: SeatPosition;
  player: PlayerView;
  /** From the lobby. Missing only if the lobby has not caught up yet. */
  info: LobbyPlayer | undefined;
  isViewer: boolean;
  isCurrent: boolean;
  isDealer: boolean;
}) {
  const total = player.holeScores.reduce((sum, s) => sum + s, 0);
  const name = info?.name ?? "Player";
  return (
    <section
      className={`seat ${position}${isCurrent ? " current" : ""}`}
      aria-label={isViewer ? `${name} (you)` : name}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="who">
        <div className="portrait">
          {info !== undefined && <Avatar id={info.avatar} />}
        </div>
        <span className="seat-name">{isViewer ? `${name} (you)` : name}</span>
        <span className="seat-meta">
          {isDealer && <span className="tag">Dealer</span>}
          {info?.isBot === true && <span className="tag">Bot</span>}
          {info !== undefined && !info.connected && (
            <span className="tag away">Away</span>
          )}
          <span>Score {total}</span>
        </span>
      </div>
      <Hand grid={player.grid} size={isViewer ? "full" : "mini"} />
    </section>
  );
}
