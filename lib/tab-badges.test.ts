import { CONVERSATIONS } from "@/lib/mock-data";
import {
  conversationsTabBadge,
  unassignedTabBadge,
} from "@/lib/tab-badges";
import type { Conversation } from "@/lib/types";

describe("unassignedTabBadge", () => {
  it("counts the support threads nobody has engaged", () => {
    expect(unassignedTabBadge(CONVERSATIONS)).toBe(
      CONVERSATIONS.filter((c) => c.status === "unassigned").length,
    );
  });

  it("omits when the pool is empty", () => {
    const engaged: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      status: c.status === "unassigned" ? ("engaged" as const) : c.status,
    }));
    expect(unassignedTabBadge(engaged)).toBeUndefined();
  });
});

describe("conversationsTabBadge", () => {
  it("sums unread for an Admin over every thread", () => {
    const expected = CONVERSATIONS.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    expect(conversationsTabBadge("admin", "admin-1", CONVERSATIONS)).toBe(
      expected > 0 ? expected : undefined,
    );
  });

  it("omits when nothing is unread", () => {
    const zero: Conversation[] = CONVERSATIONS.map((c) => ({ ...c, unreadCount: 0 }));
    expect(conversationsTabBadge("admin", "admin-1", zero)).toBeUndefined();
  });

  it("counts a row the API declined to count as nothing rather than as NaN", () => {
    const uncounted: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      unreadCount: null,
    }));
    expect(conversationsTabBadge("admin", "admin-1", uncounted)).toBeUndefined();
  });
});
