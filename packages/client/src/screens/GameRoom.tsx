import { useNavigate } from "react-router";
import { useLobby } from "../store/useLobby";
import { errorText } from "./errors";
import { Table } from "./table/Table";

/** The game in progress. */
export function GameRoom() {
  const navigate = useNavigate();
  const lobby = useLobby((s) => s.lobby);
  const game = useLobby((s) => s.game);
  const error = useLobby((s) => s.error);
  const act = useLobby((s) => s.act);
  const leave = useLobby((s) => s.leave);

  const leaveRoom = () => void leave().then(() => navigate("/"));

  return (
    <main className="game">
      {game === null || lobby === null ? (
        <>
          <p className="panel">Dealing the cards…</p>
          <button type="button" className="button" onClick={leaveRoom}>
            Leave Room
          </button>
        </>
      ) : (
        <Table view={game.view} lobby={lobby} onAct={act} onLeave={leaveRoom} />
      )}
      {error !== null && (
        <p className="banner" role="alert">
          {errorText(error)}
        </p>
      )}
    </main>
  );
}
