import { useEffect, useState } from "react";
import type { GameUpdate } from "@golf/shared";

/**
 * Whole seconds left until `deadline`, which is on the server's clock. The
 * server's clock when it sent the update (`serverTime`) and ours when it
 * arrived (`receivedAt`) tell us how far apart the two clocks are, so a
 * wrong clock on this device does not matter.
 */
export function secondsUntil(
  deadline: number,
  serverTime: number,
  receivedAt: number,
  now: number,
): number {
  const serverNow = serverTime + (now - receivedAt);
  return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
}

/** The current time, refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Seconds until the next hole starts by itself, or `null` if it is not counting down. */
export function useNextHoleSeconds(
  update: GameUpdate,
  receivedAt: number | null,
): number | null {
  const counting = update.nextHoleAt !== null && receivedAt !== null;
  const now = useNow(counting);
  if (update.nextHoleAt === null || receivedAt === null) return null;
  return secondsUntil(update.nextHoleAt, update.serverTime, receivedAt, now);
}
