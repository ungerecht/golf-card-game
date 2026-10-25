import { useEffect, useRef, useState } from "react";
import type { GameView, LobbySnapshot } from "@golf/shared";
import { LeaveConfirm } from "./LeaveConfirm";
import { ScoreSheet } from "./ScoreSheet";
import { scoreColumns } from "./scores";

type Open = "none" | "menu" | "scores" | "leave";

/** The hamburger button in the corner, and everything it opens. */
export function GameMenu({
  view,
  lobby,
  onLeave,
}: {
  view: GameView;
  lobby: LobbySnapshot;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState<Open>("none");
  const root = useRef<HTMLDivElement>(null);

  // The little menu closes on Escape or a click anywhere else.
  useEffect(() => {
    if (open !== "menu") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen("none");
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen("none");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="game-menu" ref={root}>
      <button
        type="button"
        className="hamburger"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open === "menu"}
        onClick={() => setOpen(open === "menu" ? "none" : "menu")}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          dehaze
        </span>
      </button>
      {open === "menu" && (
        <div className="panel menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => setOpen("scores")}
          >
            View scores
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => setOpen("leave")}
          >
            Leave room
          </button>
        </div>
      )}
      {open === "scores" && (
        <ScoreSheet
          columns={scoreColumns(view, lobby)}
          holes={view.settings.holes}
          onClose={() => setOpen("none")}
        />
      )}
      {open === "leave" && (
        <LeaveConfirm onStay={() => setOpen("none")} onLeave={onLeave} />
      )}
    </div>
  );
}
