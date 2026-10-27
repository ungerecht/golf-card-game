import type {
  Action,
  LobbyPlayer,
  PlayerView,
  SlotIndex,
  GameView,
  DrawSource,
} from "@golf/shared";
import { Avatar } from "../Avatar";
import { CardSprite } from "./CardSprite";
import { Hand } from "./Hand";
import type { SeatPosition } from "./seats";
import { selectionUrl } from "../../cards";
import { NO_HOLD, anchorKey, type Hold } from "../../animation/plan";

/** A player at the table: portrait, name, and their six cards. */
export function Seat({
  position,
  player,
  info,
  view,
  actions,
  onAct,
  hold = NO_HOLD,
}: {
  position: SeatPosition;
  player: PlayerView;
  /** From the lobby. Missing only if the lobby has not caught up yet. */
  info: LobbyPlayer | undefined;
  view: GameView;
  /** What clicking each of your cards does. Only the viewer's own seat has any. */
  actions?: ReadonlyMap<SlotIndex, Action>;
  onAct?: (action: Action) => void;
  /** Cards still flying in are not drawn yet. */
  hold?: Hold;
}) {
  const name = info?.name ?? "Player";
  const isCurrent = player.id === view.currentPlayerId;
  const isDealer = player.id === view.dealerId;
  const held = view.phase.type === "place" ? view.phase : null;

  return (
    <section
      className={`seat ${position}${isCurrent ? " current" : ""}`}
      aria-label={name}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="who">
        <div className="portrait">
          {info !== undefined && <Avatar id={info.avatar} />}
          <span className="seat-meta">
            {isDealer && <span className="tag">D</span>}
            {info !== undefined && !info.connected && (
              <span className="tag away" aria-label="Away">
                ...
              </span>
            )}
          </span>
        </div>
        <span className="seat-name">{name}</span>
      </div>
      <div className="hand-wrap">
        <Hand
          playerId={player.id}
          grid={player.grid}
          actions={actions}
          onAct={onAct}
          hold={hold}
        />
        {held && isCurrent && (
          // Floats above your cards so nothing else moves while you hold it.
          <div
            className={
              "held " +
              held.source +
              " " +
              position +
              (hold.anchors.has(heldAnchor(player.id, held.source))
                ? " is-hidden"
                : "")
            }
            data-anchor={heldAnchor(player.id, held.source)}
            role="group"
            aria-label="Drawn card"
          >
            <CardSprite face={held.drawn ?? "back"} />
            <img
              className="selection"
              src={selectionUrl()}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function heldAnchor(playerId: string, source: DrawSource): string {
  return anchorKey({ kind: "held", playerId, source });
}
