import type { GameUpdate, LobbySnapshot } from "@golf/shared";
import { AVATAR_LABELS } from "../../avatars";
import { Avatar } from "../Avatar";
import { useNextHoleSeconds } from "./countdown";
import { Dialog } from "./Dialog";

function countdownText(seconds: number | null): string {
  return seconds === null ? "" : `Next hole starts in ${seconds}s`;
}

/** How each player did on the hole that just finished. */
export function HoleSummary({
  update,
  receivedAt,
  lobby,
  onStartNext,
  onClose,
}: {
  update: GameUpdate;
  receivedAt: number | null;
  lobby: LobbySnapshot;
  onStartNext: () => void;
  onClose: () => void;
}) {
  const { view } = update;
  const seconds = useNextHoleSeconds(update, receivedAt);
  const isHost = view.viewerId !== null && view.viewerId === lobby.hostId;

  const rows = view.players
    .map((p) => {
      const who = lobby.players.find((l) => l.id === p.id);
      return {
        id: p.id,
        name: who?.name ?? "Player",
        avatar: who?.avatar ?? null,
        hole: p.holeScores[view.hole - 1] ?? 0,
        total: p.holeScores.reduce((sum, s) => sum + s, 0),
        isViewer: p.id === view.viewerId,
      };
    })
    // Lowest score first. Ties keep their seating order.
    .sort((a, b) => a.hole - b.hole);

  return (
    <Dialog
      title={`Hole ${view.hole} complete`}
      onClose={onClose}
      closeLabel="View the table"
    >
      <table className="scores hole-scores">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Player</span>
            </th>
            <th scope="col">This hole</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <div className="who-cell">
                  {r.avatar !== null && (
                    <span
                      className="score-face small"
                      role="img"
                      aria-label={AVATAR_LABELS[r.avatar]}
                    >
                      <Avatar id={r.avatar} />
                    </span>
                  )}
                  <span className="score-name">{r.name}</span>
                </div>
              </th>
              <td>{r.hole}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dialog-text" role="timer">
        {countdownText(seconds)}
      </p>
      {isHost ? (
        <button type="button" className="button primary" onClick={onStartNext}>
          Start hole {view.hole + 1}
        </button>
      ) : (
        <p className="dialog-text">
          Waiting for the host to start hole {view.hole + 1}…
        </p>
      )}
    </Dialog>
  );
}

/** What is left on screen once the summary is closed, to get it back. */
export function ResultsBar({
  update,
  receivedAt,
  onShow,
}: {
  update: GameUpdate;
  receivedAt: number | null;
  onShow: () => void;
}) {
  const seconds = useNextHoleSeconds(update, receivedAt);
  return (
    <div className="results-bar panel">
      <span role="timer">{countdownText(seconds) || "Hole complete"}</span>
      <button type="button" className="button" onClick={onShow}>
        Show results
      </button>
    </div>
  );
}
