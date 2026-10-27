// How long things take, in milliseconds. One place, so the feel is easy to tune.

/** A card crossing the table. */
export const FLIGHT_MS = 260;
/** A card turning over, face to back or back to face. */
export const FLIP_MS = 240;
/** One pass of the deck being riffled. The shuffle plays a few passes. */
export const SHUFFLE_PASS_MS = 280;
export const SHUFFLE_PASSES = 2;
/** How long one card takes to reach its seat when dealing. */
export const DEAL_FLIGHT_MS = 200;
/** Gap between two dealt cards, at most. */
export const DEAL_STAGGER_MS = 60;
/** The whole deal never takes longer than this, however many players there are. */
export const DEAL_TOTAL_MS = 1400;
/** Gap between cards turning over together, when someone goes out. */
export const REVEAL_STAGGER_MS = 70;
