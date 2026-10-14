import type { Card } from "./cards";
import {
  GRID_COLUMNS,
  type Grid,
  type PlayerId,
  type PlayerState,
} from "./state";

/** Ace 1, number cards face value, Jack 11, Queen 12, King 0. */
export function cardValue(card: Card): number {
  switch (card.rank) {
    case "A":
      return 1;
    case "J":
      return 11;
    case "Q":
      return 12;
    case "K":
      return 0;
    default:
      return Number(card.rank);
  }
}

// Two cards of the same rank in a column cancel out to 0, whatever their suits.
function columnScore(upper: Card, lower: Card): number {
  return upper.rank === lower.rank ? 0 : cardValue(upper) + cardValue(lower);
}

// Score of one grid.
// Counts every card, face up or not, so call it once the hole is over.
export function scoreGrid(grid: Grid): number {
  let total = 0;
  for (const [top, bottom] of GRID_COLUMNS) {
    total += columnScore(grid[top].card, grid[bottom].card);
  }
  return total;
}

// Score of the face-up cards only. Used to decide who goes first.
// A column only counts as a match when both of its cards are face up.
export function showingScore(grid: Grid): number {
  let total = 0;
  for (const [top, bottom] of GRID_COLUMNS) {
    const upper = grid[top];
    const lower = grid[bottom];
    if (upper.faceUp && lower.faceUp) {
      total += columnScore(upper.card, lower.card);
    } else if (upper.faceUp) {
      total += cardValue(upper.card);
    } else if (lower.faceUp) {
      total += cardValue(lower.card);
    }
  }
  return total;
}

// Score every player's grid for a finished hole.
export function scoreHole(
  players: readonly Pick<PlayerState, "id" | "grid">[],
): Record<PlayerId, number> {
  const scores: Record<PlayerId, number> = {};
  for (const player of players) {
    scores[player.id] = scoreGrid(player.grid);
  }
  return scores;
}

export function totalScore(player: Pick<PlayerState, "holeScores">): number {
  return player.holeScores.reduce((sum, score) => sum + score, 0);
}

// Players with the lowest total. More than one means a tie.
export function getWinnerIds(players: readonly PlayerState[]): PlayerId[] {
  if (players.length === 0) return [];
  const lowest = Math.min(...players.map(totalScore));
  return players
    .filter((player) => totalScore(player) === lowest)
    .map((player) => player.id);
}
