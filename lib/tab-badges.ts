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
