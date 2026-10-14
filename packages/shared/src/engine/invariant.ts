/**
 * Guards against states that should be impossible. If one of these fires, the
 * engine has a bug (the caller did nothing wrong), so it throws instead of
 * returning an `ActionError`.
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Engine invariant violated: ${message}`);
  }
}
