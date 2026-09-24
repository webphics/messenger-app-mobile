import { totalUnread } from "@/lib/conversation-list";
import { communityConversations, inboxConversations } from "@/lib/conversation-scope";
import { listUnassignedConversations } from "@/lib/inbox-filter";
import type { Conversation } from "@/lib/types";

/**
 * Unassigned pool size for the Unassigned tab badge; omit when empty, and in a
 * Shared queue, which has no pool — a thread there can still say `unassigned`,
 * and counting it would badge a tab that is not drawn.
 */
export function unassignedTabBadge(
  conversations: Conversation[],
  supportAssignment: boolean,
): number | undefined {
  if (!supportAssignment) return undefined;
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
  const n = totalUnread(inboxConversations(conversations));
  return n > 0 ? n : undefined;
}

/**
 * Unread across the Communities tab; omit when empty.
 *
 * The mirror of the badge above, over the other half of the same list, so the
 * two are exhaustive and disjoint by construction: every unread thread is
 * counted under exactly one tab, and moving a room between the two surfaces
 * moves its count with it rather than needing a second edit here.
 *
 * Counted off the Conversation list rather than off the Communities tab's own
 * fetch, because that fetch does not happen until somebody opens the tab — and
 * a badge that only appears once you have looked is not a badge. The
 * Conversation list is already loaded for every screen and the socket already
 * keeps it moving, so this is live from launch and clears the moment a room is
 * read, through the same `markRead` every other count goes through.
 */
export function communitiesTabBadge(
  conversations: Conversation[],
): number | undefined {
  const n = totalUnread(communityConversations(conversations));
  return n > 0 ? n : undefined;
}
