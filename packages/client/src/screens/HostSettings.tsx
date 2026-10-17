import { useState } from "react";
import { useNavigate } from "react-router";
import { DEFAULT_SETTINGS, type GameSettings } from "@golf/shared";
import { useLobby } from "../store/useLobby";

type Choice = { value: string; label: string };

function Select({
  label,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HostSettings() {
  const navigate = useNavigate();
  const createRoom = useLobby((s) => s.createRoom);
  const connection = useLobby((s) => s.connection);
  const notice = useLobby((s) => s.notice);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const busy = connection === "connecting";

  const create = async () => {
    const code = await createRoom(settings);
    if (code !== null) void navigate(`/room/${code}`);
  };

  return (
    <main className="screen">
      <h1 className="title small">Room settings</h1>

      {notice !== null && (
        <p className="banner" role="alert">
          {notice}
        </p>
      )}

      <div className="panel stack">
        <Select
          label="Max players"
          value={String(settings.maxPlayers)}
          choices={[2, 3, 4].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) =>
            setSettings({
              ...settings,
              maxPlayers: Number(v) as GameSettings["maxPlayers"],
            })
          }
        />
        <Select
          label="Holes"
          value={String(settings.holes)}
          choices={[3, 6, 9].map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) =>
            setSettings({
              ...settings,
              holes: Number(v) as GameSettings["holes"],
            })
          }
        />
        <Select
          label="Bots"
          value={settings.bots ? "on" : "off"}
          choices={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
          onChange={(v) => setSettings({ ...settings, bots: v === "on" })}
        />
        <Select
          label="Bot difficulty"
          value={settings.botDifficulty}
          disabled={!settings.bots}
          choices={[
            { value: "easy", label: "Easy" },
            { value: "normal", label: "Normal" },
          ]}
          onChange={(v) =>
            setSettings({
              ...settings,
              botDifficulty: v as GameSettings["botDifficulty"],
            })
          }
        />
      </div>

      <div className="row">
        <button
          type="button"
          className="button"
          onClick={() => void navigate("/")}
        >
          Back
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void create()}
        >
          Create Room
        </button>
      </div>
    </main>
  );
}
