import { useState } from "react";
import { useNavigate } from "react-router";
import { useGameAnimation } from "../animation/useGameAnimation";
import { useLobby } from "../store/useLobby";
import { Chat } from "./chat/Chat";
import { errorText } from "./errors";
import { GameOver } from "./table/GameOver";
import { HoleSummary, ResultsBar } from "./table/HoleSummary";
import { Table } from "./table/Table";

/** The game in progress, between holes, or finished. */
export function GameRoom() {
  const navigate = useNavigate();
  const lobby = useLobby((s) => s.lobby);
  const latest = useLobby((s) => s.game);
  const latestAt = useLobby((s) => s.gameAt);
  // What is on screen trails the server a little, while cards fly.
  const { game, gameAt, hold, layerRef } = useGameAnimation(latest, latestAt);
  const error = useLobby((s) => s.error);
  const act = useLobby((s) => s.act);
  const playAgain = useLobby((s) => s.playAgain);
  const leave = useLobby((s) => s.leave);
  // The hole whose summary was closed to look at the table.
  const [closedHole, setClosedHole] = useState<number | null>(null);

  const leaveRoom = () => void leave().then(() => navigate("/"));
  // Cards fly across this. It is always here, so the first deal can start.
  const fx = <div className="fx-layer" ref={layerRef} aria-hidden="true" />;
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
        <Chat />
        {errorBanner}
        {fx}
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
        <Chat />
        {errorBanner}
        {fx}
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
        chat={<Chat />}
        hold={hold}
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
      {fx}
    </main>
  );
}
