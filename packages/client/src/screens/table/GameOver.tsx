import type { GameResult, LobbySnapshot } from "@golf/shared";
import { ScoreTable } from "./ScoreTable";
import { resultColumns, winnerText } from "./scores";

/** The end of the game: who won, the final scores, and what to do next. */
export function GameOver({
  result,
  lobby,
  viewerId,
  holes,
  onPlayAgain,
  onLeave,
}: {
  result: GameResult;
  lobby: LobbySnapshot;
  viewerId: string | null;
  holes: number;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const isHost = viewerId !== null && viewerId === lobby.hostId;
  const winners = new Set(result.winners.map((w) => w.playerId));
  return (
    <section className="game-over" aria-label="Game over">
      <h1 className="title small">Game over</h1>
      <p className="panel winner-banner" role="status">
        {winnerText(result, viewerId)}
      </p>
      <div className="panel">
        <ScoreTable
          columns={resultColumns(result, viewerId)}
          holes={holes}
          winners={winners}
        />
      </div>
      <div className="row">
        <button type="button" className="button" onClick={onLeave}>
          Leave Room
        </button>
        {isHost && (
          <button
            type="button"
            className="button primary"
            onClick={onPlayAgain}
          >
            Play Again
          </button>
        )}
      </div>
      {!isHost && (
        <p className="hint">Waiting for the host to start another game…</p>
      )}
    </section>
  );
}
