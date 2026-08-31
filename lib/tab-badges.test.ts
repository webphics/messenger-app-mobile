import { CONVERSATIONS } from "@/lib/mock-data";
import {
  conversationsTabBadge,
  unassignedTabBadge,
} from "@/lib/tab-badges";
import type { Conversation } from "@/lib/types";

describe("unassignedTabBadge", () => {
  it("returns pool size when unassigned exist", () => {
    expect(unassignedTabBadge(CONVERSATIONS)).toBe(
      CONVERSATIONS.filter((c) => c.assigneeId === null).length,
    );
  });

  it("omits when pool is empty", () => {
    const none: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      assigneeId: c.assigneeId ?? "agent-1",
    }));
    expect(unassignedTabBadge(none)).toBeUndefined();
  });
});

describe("conversationsTabBadge", () => {
  it("sums unread for admin over all threads", () => {
    const expected = CONVERSATIONS.reduce((s, c) => s + c.unreadCount, 0);
    expect(conversationsTabBadge("admin", "admin-1", CONVERSATIONS)).toBe(
      expected > 0 ? expected : undefined,
    );
  });

  it("omits when all unread are zero for customer-visible set", () => {
    const zero: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      unreadCount: 0,
    }));
    expect(conversationsTabBadge("admin", "admin-1", zero)).toBeUndefined();
  });
});
