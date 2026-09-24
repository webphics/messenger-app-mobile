import { CONVERSATIONS } from "@/lib/mock-data";
import { inboxTabBadge, unassignedTabBadge } from "@/lib/tab-badges";
import type { Conversation } from "@/lib/types";

describe("unassignedTabBadge", () => {
  it("counts the support threads nobody has engaged", () => {
    expect(unassignedTabBadge(CONVERSATIONS, true)).toBe(
      CONVERSATIONS.filter((c) => c.status === "unassigned").length,
    );
  });

  it("omits when the pool is empty", () => {
    const engaged: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      status: c.status === "unassigned" ? ("engaged" as const) : c.status,
    }));
    expect(unassignedTabBadge(engaged, true)).toBeUndefined();
  });

  it("omits in a Shared queue, however many threads say unassigned", () => {
    expect(CONVERSATIONS.some((c) => c.status === "unassigned")).toBe(true);
    expect(unassignedTabBadge(CONVERSATIONS, false)).toBeUndefined();
  });
});

describe("inboxTabBadge, for staff", () => {
  it("sums unread over every row the API sent", () => {
    const expected = CONVERSATIONS.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    expect(inboxTabBadge(CONVERSATIONS)).toBe(expected > 0 ? expected : undefined);
  });

  it("omits when nothing is unread", () => {
    const zero: Conversation[] = CONVERSATIONS.map((c) => ({ ...c, unreadCount: 0 }));
    expect(inboxTabBadge(zero)).toBeUndefined();
  });

  it("falls back to the receipt where the API declined to count", () => {
    const uncounted: Conversation[] = CONVERSATIONS.map((c) => ({
      ...c,
      unreadCount: null,
    }));
    const unreadRows = uncounted.filter(
      (c) => !c.lastMessageMine && !c.lastMessageRead,
    ).length;
    expect(inboxTabBadge(uncounted)).toBe(unreadRows > 0 ? unreadRows : undefined);
  });
});

describe("inboxTabBadge, for a Customer", () => {
  function row(id: string, unreadCount: number | null): Conversation {
    return {
      id,
      organizationId: "org-1",
      type: "support_dm",
      lastMessageAt: "2026-08-13T08:00:00.000Z",
      lastMessagePreview: "Hello",
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount,
    } as Conversation;
  }

  it.each([
    ["sums the counts the list endpoint sent", [2, 3], 5],
    ["omits when every thread is read", [0, 0], undefined],
    ["omits an empty inbox", [], undefined],
    [
      "counts an uncounted row the receipt calls unread as one, never as nothing",
      [null, null],
      2,
    ],
    ["adds a counted row to an uncounted one", [null, 4], 5],
  ] as const)("%s", (_name, counts, expected) => {
    expect(
      inboxTabBadge(counts.map((count, i) => row(`c${i}`, count))),
    ).toBe(expected);
  });

  it("omits an uncounted row the receipt already calls read", () => {
    const read = { ...row("c0", null), lastMessageRead: true } as Conversation;
    expect(inboxTabBadge([read])).toBeUndefined();
  });

  it("counts a Customer's group thread, which no role filter may drop", () => {
    const group = {
      ...row("g1", 3),
      type: "group",
      title: "Offers",
      description: null,
      avatarUrl: null,
      members: [],
    } as Conversation;
    expect(inboxTabBadge([group])).toBe(3);
  });
});
