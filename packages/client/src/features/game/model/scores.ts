import {
  totalScore,
  type AvatarId,
  type GameResult,
  type GameView,
  type LobbySnapshot,
} from "@golf/shared";

/** One column of the score sheet. */
export interface ScoreColumn {
  readonly playerId: string;
  readonly name: string;
  readonly avatar: AvatarId | null;
  readonly isViewer: boolean;
  /** Score of each finished hole, in order. */
  readonly holeScores: readonly number[];
  readonly total: number;
}

/** The scores so far, one column per player in seating order. Only finished holes count. */
export function scoreColumns(
  view: GameView,
  lobby: LobbySnapshot,
): ScoreColumn[] {
  return view.players.map((player) => {
    const who = lobby.players.find((p) => p.id === player.id);
    return {
      playerId: player.id,
      name: who?.name ?? "Player",
      avatar: who?.avatar ?? null,
      isViewer: player.id === view.viewerId,
      holeScores: player.holeScores,
      total: totalScore(player),
    };
  });
}

/** The final scores, best first, as columns for the score table. */
export function resultColumns(
  result: GameResult,
  viewerId: string | null,
): ScoreColumn[] {
  return result.scoresheet.map((row) => ({
    playerId: row.playerId,
    name: row.name,
    avatar: row.avatar,
    isViewer: row.playerId === viewerId,
    holeScores: row.holeScores,
    total: row.total,
  }));
}

/** "You win!", "Ann wins!" or "Ann and Bo tie!" */
export function winnerText(
  result: GameResult,
  viewerId: string | null,
): string {
  const { winners } = result;
  const [only] = winners;
  if (winners.length === 1 && only !== undefined) {
    return only.playerId === viewerId ? "You win!" : `${only.name} wins!`;
  }
  const names = winners.map((w) => w.name);
  const last = names.pop();
  return `${names.length > 0 ? `${names.join(", ")} and ` : ""}${last ?? "Nobody"} tie!`;
}
