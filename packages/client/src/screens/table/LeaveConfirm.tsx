import { Dialog } from "./Dialog";

/** "Are you sure?" before walking out of a game. */
export function LeaveConfirm({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog
      title="Are you sure?"
      onClose={onStay}
      closeLabel="Stay in the game"
    >
      <p className="dialog-text">You will leave this game.</p>
      <div className="row">
        <button type="button" className="button" onClick={onStay} autoFocus>
          Stay
        </button>
        <button type="button" className="button danger" onClick={onLeave}>
          Leave
        </button>
      </div>
    </Dialog>
  );
}
