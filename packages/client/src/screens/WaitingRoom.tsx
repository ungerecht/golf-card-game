import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import {
  AVATAR_IDS,
  PLAYER_NAME_MAX_LENGTH,
  PlayerNameSchema,
  type AvatarId,
} from "@golf/shared";
import { AVATAR_LABELS } from "../avatars";
import { loadProfile, saveProfile } from "../net/storage";
import { useLobby } from "../store/useLobby";
import { Avatar } from "./Avatar";
import { GameRoom } from "./GameRoom";
import { errorText } from "./errors";
import { Chat } from "./chat/Chat";

export function WaitingRoom() {
  const navigate = useNavigate();
  const routeCode = (useParams().code ?? "").toUpperCase();

  const connection = useLobby((s) => s.connection);
  const code = useLobby((s) => s.code);
  const myId = useLobby((s) => s.myId);
  const lobby = useLobby((s) => s.lobby);
  const error = useLobby((s) => s.error);
  const resume = useLobby((s) => s.resume);
  const ready = useLobby((s) => s.ready);
  const start = useLobby((s) => s.start);
  const leave = useLobby((s) => s.leave);

  // After a refresh or a pasted link there is no connection yet, so make one.
  // If we are idle after having been connected or connecting, we were removed,
  // the room closed, or it was never there, so go home.
  const wasActive = useRef(false);
  useEffect(() => {
    if (connection !== "idle") wasActive.current = true;
    else if (wasActive.current) void navigate("/");
    else void resume(routeCode);
  }, [connection, navigate, resume, routeCode]);

  const [profile] = useState(loadProfile);
  const [name, setName] = useState(profile.name);
  const [chosen, setChosen] = useState<AvatarId | null>(profile.avatar);

  const taken = new Set(lobby?.players.map((p) => p.avatar));
  // Someone else may grab the avatar we had picked while we were deciding.
  const avatar = chosen !== null && !taken.has(chosen) ? chosen : null;

  if (connection === "connected" && code !== null && code !== routeCode) {
    return <Navigate to={`/room/${code}`} replace />;
  }
  if (connection !== "connected" || lobby === null || myId === null) {
    return (
      <main className="screen">
        <p className="panel">Connecting…</p>
      </main>
    );
  }
  if (lobby.started) return <GameRoom />;

  const seated = lobby.players.some((p) => p.id === myId);
  const isHost = lobby.hostId === myId;
  const { maxPlayers, bots } = lobby.settings;
  const validName = PlayerNameSchema.safeParse(name).success;
  const canStart = isHost && seated && (bots || lobby.players.length >= 2);

  const leaveRoom = async () => {
    await leave();
    void navigate("/");
  };

  const submit = () => {
    if (avatar === null || !validName) return;
    saveProfile({ name: name.trim(), avatar });
    ready(name.trim(), avatar);
  };

  return (
    <main className="screen waiting">
      <h1 className="title small">Waiting room</h1>

      <section className="panel code-panel" aria-label="Room code">
        <span className="label">Room code</span>
        <strong className="code" data-testid="room-code">
          {lobby.code}
        </strong>
      </section>

      <ul className="slots" aria-label="Players">
        {Array.from({ length: maxPlayers }, (_, i) => {
          const player = lobby.players[i];
          if (player === undefined) {
            return (
              <li key={i} className="slot empty">
                <div className="portrait placeholder" aria-hidden="true">
                  ?
                </div>
                <span className="slot-name">{bots ? "Bot" : "Open"}</span>
              </li>
            );
          }
          return (
            <li key={player.id} className="slot">
              <div className="portrait">
                <Avatar id={player.avatar} />
              </div>
              <span className="slot-name">{player.name}</span>
              {player.id === lobby.hostId && <span className="tag">Host</span>}
            </li>
          );
        })}
      </ul>

      {!seated && (
        <section className="panel stack" aria-label="Choose your player">
          <fieldset className="avatar-grid">
            <legend>Choose an avatar</legend>
            {AVATAR_IDS.map((id) => {
              const isTaken = taken.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="avatar-choice"
                  aria-pressed={avatar === id}
                  aria-label={
                    isTaken ? `${AVATAR_LABELS[id]} (taken)` : AVATAR_LABELS[id]
                  }
                  disabled={isTaken}
                  onClick={() => setChosen(id)}
                >
                  <Avatar id={id} grey={isTaken} />
                </button>
              );
            })}
          </fieldset>
          <label className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PLAYER_NAME_MAX_LENGTH}
              autoComplete="nickname"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={avatar === null || !validName}
            onClick={submit}
          >
            Ready
          </button>
        </section>
      )}

      {error !== null && (
        <p className="banner" role="alert">
          {errorText(error)}
        </p>
      )}

      {seated && !isHost && (
        <p className="hint">Waiting for the host to start the game…</p>
      )}
      {isHost && seated && !canStart && (
        <p className="hint">Waiting for at least one more player…</p>
      )}

      {seated && <Chat />}

      <div className="row">
        <button
          type="button"
          className="button"
          onClick={() => void leaveRoom()}
        >
          Leave Room
        </button>
        {isHost && (
          <button
            type="button"
            className="button primary"
            disabled={!canStart}
            onClick={start}
          >
            Start Game
          </button>
        )}
      </div>
    </main>
  );
}
