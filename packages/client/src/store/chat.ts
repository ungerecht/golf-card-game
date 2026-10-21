import { CHAT_HISTORY_LIMIT, type ChatMessage } from "@golf/shared";

/**
 * Add messages to the chat we have. Anything we already hold is skipped, so a
 * history that overlaps what we saw live does no harm. The result is in order
 * and holds only the most recent messages.
 */
export function mergeChat(
  have: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): readonly ChatMessage[] {
  const known = new Set(have.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return have;
  return [...have, ...fresh]
    .sort((a, b) => a.id - b.id)
    .slice(-CHAT_HISTORY_LIMIT);
}
