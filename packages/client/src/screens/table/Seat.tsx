import type {
  Action,
  Card,
  LobbyPlayer,
  PlayerView,
  SlotIndex,
} from "@golf/shared";
import { Avatar } from "../Avatar";
import { CardSprite } from "./CardSprite";
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
  held,
  actions,
  onAct,
}: {
  position: SeatPosition;
  player: PlayerView;
  /** From the lobby. Missing only if the lobby has not caught up yet. */
  info: LobbyPlayer | undefined;
  isViewer: boolean;
  isCurrent: boolean;
  isDealer: boolean;
  /** The card you have drawn and not yet placed. Only the viewer's seat shows one. */
  held?: Card | null;
  /** What clicking each of your cards does. Only the viewer's own seat has any. */
  actions?: ReadonlyMap<SlotIndex, Action>;
  onAct?: (action: Action) => void;
}) {
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
        </span>
      </div>
      <div className="hand-wrap">
        <Hand
          grid={player.grid}
          size={isViewer ? "full" : "mini"}
          actions={actions}
          onAct={onAct}
        />
        {held != null && (
          // Floats above your cards so nothing else moves while you hold it.
          <div className="held" role="group" aria-label="Your drawn card">
            <CardSprite face={held} size="full" />
          </div>
        )}
      </div>
    </section>
  );
}
