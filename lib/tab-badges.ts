import { totalUnread } from "@/lib/conversation-state";
import {
  listInboxConversations,
  listUnassignedConversations,
} from "@/lib/inbox-filter";
import type { Conversation, UserRole } from "@/lib/types";

/** Unassigned pool size for the Unassigned tab badge; omit when empty. */
export function unassignedTabBadge(
  conversations: Conversation[],
): number | undefined {
  const n = listUnassignedConversations(conversations).length;
  return n > 0 ? n : undefined;
}

/** Sum of unread in the role’s Conversations inbox; omit when empty. */
export function conversationsTabBadge(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): number | undefined {
  const n = totalUnread(listInboxConversations(role, userId, conversations));
  return n > 0 ? n : undefined;
}

/**
 * Unread across a Customer's own conversations; omit when empty.
 *
 * No role filter: the API scopes the list it sends, so every row in it is one
 * this person may see — and re-checking would drop a group whose membership the
 * Customer's payload does not name.
 */
export function customerMessagesBadge(
  conversations: Conversation[],
): number | undefined {
  const n = totalUnread(conversations);
  return n > 0 ? n : undefined;
}
