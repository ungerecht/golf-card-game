import { useState } from "react";
import { useNavigate } from "react-router";
import { useLobby } from "../store/useLobby";
import { errorText } from "./errors";
import { GameOver } from "./table/GameOver";
import { HoleSummary, ResultsBar } from "./table/HoleSummary";
import { Table } from "./table/Table";

/** The game in progress, between holes, or finished. */
export function GameRoom() {
  const navigate = useNavigate();
  const lobby = useLobby((s) => s.lobby);
  const game = useLobby((s) => s.game);
  const gameAt = useLobby((s) => s.gameAt);
  const error = useLobby((s) => s.error);
  const act = useLobby((s) => s.act);
  const playAgain = useLobby((s) => s.playAgain);
  const leave = useLobby((s) => s.leave);
  // The hole whose summary was closed to look at the table.
  const [closedHole, setClosedHole] = useState<number | null>(null);

  const leaveRoom = () => void leave().then(() => navigate("/"));
  const errorBanner = error !== null && (
    <p className="banner" role="alert">
      {errorText(error)}
    </p>
  );

  if (game === null || lobby === null) {
    return (
      <main className="game">
        <p className="panel">Dealing the cards…</p>
        <button type="button" className="button" onClick={leaveRoom}>
          Leave Room
        </button>
        {errorBanner}
      </main>
    );
  }

  const { view, result } = game;
  if (view.phase.type === "gameOver" && result !== null) {
    return (
      <main className="game">
        <GameOver
          result={result}
          lobby={lobby}
          viewerId={view.viewerId}
          holes={view.settings.holes}
          onPlayAgain={playAgain}
          onLeave={leaveRoom}
        />
        {errorBanner}
      </main>
    );
  }

  const holeOver = view.phase.type === "holeOver";
  const summaryClosed = closedHole === view.hole;
  const startNext = () => act({ type: "startNextHole" });

  return (
    <main className="game">
      <Table
        view={view}
        lobby={lobby}
        onAct={act}
        onLeave={leaveRoom}
        banner={
          holeOver && summaryClosed ? (
            <ResultsBar
              update={game}
              receivedAt={gameAt}
              onShow={() => setClosedHole(null)}
            />
          ) : undefined
        }
      />
      {holeOver && !summaryClosed && (
        <HoleSummary
          update={game}
          receivedAt={gameAt}
          lobby={lobby}
          onStartNext={startNext}
          onClose={() => setClosedHole(view.hole)}
        />
      )}
      {errorBanner}
    </main>
  );
}
