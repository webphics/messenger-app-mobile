import { totalUnread } from "@/lib/conversation-list";
import { listUnassignedConversations } from "@/lib/inbox-filter";
import type { Conversation } from "@/lib/types";

/** Unassigned pool size for the Unassigned tab badge; omit when empty. */
export function unassignedTabBadge(
  conversations: Conversation[],
): number | undefined {
  const n = listUnassignedConversations(conversations).length;
  return n > 0 ? n : undefined;
}

/**
 * Unread across the inbox tab, whoever is looking; omit when empty.
 *
 * No role filter, for every role. The API scopes the list it sends, so every row
 * in it is one this person may see — and re-checking would count something other
 * than what the screen under the badge is showing: `canViewConversation` reads a
 * membership list out of payloads that do not always carry the viewer, so a
 * staff announcement or a staff DM could sit unread in the inbox with nothing on
 * the tab to say so.
 */
export function inboxTabBadge(conversations: Conversation[]): number | undefined {
  const n = totalUnread(conversations);
  return n > 0 ? n : undefined;
}
