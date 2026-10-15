import { totalScore } from "./engine/scoring";
import type { GameResult, LobbyPlayer, ScoreRow } from "./protocol";
import type { PlayerState } from "./engine/state";

/**
 * The final scoresheet of a finished game.
 *
 * `players` are in seating order and `roster` says who they are, so a
 * player's name and avatar stay on the sheet even after they leave.
 */
export function buildGameResult(
  players: readonly Pick<PlayerState, "id" | "holeScores">[],
  roster: readonly Pick<LobbyPlayer, "id" | "name" | "avatar" | "isBot">[],
): GameResult {
  const totals = players.map((p) => totalScore(p));
  const lowest = Math.min(...totals);

  const rows = players.map((player, seat): ScoreRow => {
    const who = roster.find((r) => r.id === player.id);
    const total = totals[seat] ?? 0;
    return {
      playerId: player.id,
      name: who?.name ?? player.id,
      avatar: who?.avatar ?? "fox",
      isBot: who?.isBot ?? false,
      holeScores: player.holeScores,
      total,
      rank: 1 + totals.filter((t) => t < total).length,
      winner: total === lowest,
    };
  });

  return {
    // Array.prototype.sort is stable, so ties keep their seating order.
    scoresheet: [...rows].sort((a, b) => a.total - b.total),
    winners: rows.filter((row) => row.winner),
  };
}
