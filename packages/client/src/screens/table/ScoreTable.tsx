import type { ScoreColumn } from "./scores";

/** A row per hole and a column per player, with a total at the bottom. */
export function ScoreTable({
  columns,
  holes,
  winners,
}: {
  columns: readonly ScoreColumn[];
  /** How many holes the game has, so the unplayed ones show as blanks. */
  holes: number;
  /** Columns to mark as the winners. */
  winners?: ReadonlySet<string>;
}) {
  const mark = (c: ScoreColumn) =>
    winners?.has(c.playerId) === true ? "winner" : undefined;
  return (
    <div className="score-scroll">
      <table className="scores">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Hole</span>
            </th>
            {columns.map((c) => (
              <th key={c.playerId} scope="col" className={mark(c)}>
                <span className="score-name">{c.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: holes }, (_, hole) => (
            <tr key={hole}>
              <th scope="row">{hole + 1}</th>
              {columns.map((c) => (
                <td key={c.playerId} className={mark(c)}>
                  {c.holeScores[hole] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {columns.map((c) => (
              <td key={c.playerId} className={mark(c)}>
                {c.total}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
