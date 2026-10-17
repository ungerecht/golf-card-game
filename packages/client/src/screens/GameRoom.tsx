import { useNavigate } from "react-router";
import { useLobby } from "../store/useLobby";

/** The table comes in the next change. For now, say the game has started. */
export function GameRoom() {
  const navigate = useNavigate();
  const lobby = useLobby((s) => s.lobby);
  const leave = useLobby((s) => s.leave);

  return (
    <main className="screen">
      <h1 className="title small">Game on</h1>
      <p className="panel">
        {lobby?.players.map((p) => p.name).join(", ")} are playing. The table is
        coming soon.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => void leave().then(() => navigate("/"))}
      >
        Leave Room
      </button>
    </main>
  );
}
