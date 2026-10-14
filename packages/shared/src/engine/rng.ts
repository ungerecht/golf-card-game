/**
 * A random number source returning a float in [0, 1), like Math.random.
 *
 * The engine never calls Math.random itself. Whoever creates a game (the
 * server) passes an Rng in, so tests can use a seeded one and get the same
 * shuffle every time. In production, pass Math.random.
 */
export type Rng = () => number;

/** Small, fast seeded generator (mulberry32). Not for security, just tests and replays. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
