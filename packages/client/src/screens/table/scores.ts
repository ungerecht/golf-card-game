import { totalScore, type AvatarId, type GameView } from "@golf/shared";
import type { LobbySnapshot } from "@golf/shared";

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
