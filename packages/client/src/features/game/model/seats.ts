export type SeatPosition = "bottom" | "left" | "top" | "right";

/**
 * Where each seat sits, starting with the viewer at the bottom and going
 * round the table in turn order: the next player is to the viewer's left.
 * With two players they face each other, and with three nobody is on top.
 */
const POSITIONS: Record<number, readonly SeatPosition[]> = {
  1: ["bottom"],
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
};

export interface Seat<T> {
  readonly position: SeatPosition;
  readonly player: T;
}

/**
 * Put the players around the table, with the viewer at the bottom. `players`
 * is in seating order. A spectator, or anyone not seated, sees the first
 * player at the bottom.
 */
export function arrangeSeats<T extends { readonly id: string }>(
  players: readonly T[],
  viewerId: string | null,
): Seat<T>[] {
  const positions = POSITIONS[players.length];
  if (positions === undefined) {
    throw new RangeError(`A table seats 1 to 4 players, got ${players.length}`);
  }
  const found = players.findIndex((p) => p.id === viewerId);
  const start = found === -1 ? 0 : found;
  return positions.map((position, offset) => {
    const player = players[(start + offset) % players.length] as T;
    return { position, player };
  });
}
