import { useState } from "react";
import type { GameView, LobbyPlayer } from "@golf/shared";
import { Dialog } from "./Dialog";
import { statusText } from "./status";

/** The info button in the bottom left corner, and everything it opens. */
export function Info({
  view,
  info,
}: {
  view: GameView;
  info: Map<string, LobbyPlayer>;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const nameOf = (id: string) => info.get(id)?.name ?? "Player";
  const onClose = () => setOpen(false);

  return (
    <div className="info">
      <button
        type="button"
        className="question"
        aria-expanded={open}
        aria-label="Game info"
        onClick={() => setOpen(!open)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          help
        </span>
      </button>
      {open && (
        <Dialog title="Status" onClose={onClose} closeLabel="Close status">
          <p className="panel status" role="status">
            <span>
              Hole {view.hole} of {view.settings.holes}
            </span>
            <strong>{statusText(view, nameOf)}</strong>
          </p>
        </Dialog>
      )}
    </div>
  );
}
