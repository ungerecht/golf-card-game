import { useNavigate } from "react-router";
import { useLobby } from "../store/useLobby";
import { Table } from "./table/Table";

/** The game in progress. */
export function GameRoom() {
  const navigate = useNavigate();
  const lobby = useLobby((s) => s.lobby);
  const game = useLobby((s) => s.game);
  const leave = useLobby((s) => s.leave);

  return (
    <main className="game">
      {game === null || lobby === null ? (
        <p className="panel">Dealing the cards…</p>
      ) : (
        <Table view={game.view} lobby={lobby} />
      )}
      <button
        type="button"
        className="button leave"
        onClick={() => void leave().then(() => navigate("/"))}
      >
        Leave Room
      </button>
    </main>
  );
}
