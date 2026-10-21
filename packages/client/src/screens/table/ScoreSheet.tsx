import { Dialog } from "./Dialog";
import { ScoreTable } from "./ScoreTable";
import type { ScoreColumn } from "./scores";

/** The scores so far, in a box over the game. */
export function ScoreSheet({
  columns,
  holes,
  onClose,
}: {
  columns: readonly ScoreColumn[];
  holes: number;
  onClose: () => void;
}) {
  return (
    <Dialog title="Scores" onClose={onClose} closeLabel="Close scores">
      <ScoreTable columns={columns} holes={holes} />
    </Dialog>
  );
}
