import { AVATAR_LABELS } from "../../avatars";
import { Avatar } from "../Avatar";
import { Dialog } from "./Dialog";
import type { ScoreColumn } from "./scores";

/** The scores so far: a row per hole, a column per player. */
export function ScoreSheet({
  columns,
  holes,
  onClose,
}: {
  columns: readonly ScoreColumn[];
  /** How many holes the game has, so the unplayed ones show as blanks. */
  holes: number;
  onClose: () => void;
}) {
  return (
    <Dialog title="Scores" onClose={onClose} closeLabel="Close scores">
      <div className="score-scroll">
        <table className="scores">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Hole</span>
              </th>
              {columns.map((c) => (
                <th key={c.playerId} scope="col">
                  {c.avatar !== null && (
                    <span
                      className="score-face"
                      role="img"
                      aria-label={AVATAR_LABELS[c.avatar]}
                    >
                      <Avatar id={c.avatar} />
                    </span>
                  )}
                  <span className="score-name">
                    {c.name}
                    {c.isViewer && " (you)"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: holes }, (_, hole) => (
              <tr key={hole}>
                <th scope="row">{hole + 1}</th>
                {columns.map((c) => (
                  <td key={c.playerId}>{c.holeScores[hole] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {columns.map((c) => (
                <td key={c.playerId}>{c.total}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Dialog>
  );
}
