import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LOBBY_CODE_LENGTH } from "@golf/shared";
import { cleanCode } from "./cleanCode";
import { useLobby } from "../store/useLobby";

export function Landing() {
  const navigate = useNavigate();
  const joinRoom = useLobby((s) => s.joinRoom);
  const connection = useLobby((s) => s.connection);
  const notice = useLobby((s) => s.notice);
  const dismissNotice = useLobby((s) => s.dismissNotice);
  const [code, setCode] = useState("");

  const busy = connection === "connecting";
  const canJoin = code.length === LOBBY_CODE_LENGTH && !busy;

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (!canJoin) return;
    if (await joinRoom(code)) void navigate(`/room/${code}`);
  };

  return (
    <main className="screen landing">
      <h1 className="title">Six Card Golf</h1>

      {notice !== null && (
        <p className="banner" role="alert">
          {notice}
          <button
            type="button"
            className="link"
            onClick={dismissNotice}
            aria-label="Dismiss message"
          >
            OK
          </button>
        </p>
      )}

      <form className="panel stack" onSubmit={join}>
        <label className="field">
          <span>Room code</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => {
              setCode(cleanCode(e.target.value));
              if (notice !== null) dismissNotice();
            }}
            maxLength={LOBBY_CODE_LENGTH}
            placeholder="ABCDE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
          />
        </label>
        <button type="submit" className="button primary" disabled={!canJoin}>
          Join
        </button>
      </form>

      <p className="or">or</p>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void navigate("/host")}
      >
        Host
      </button>
    </main>
  );
}
