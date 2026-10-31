import type { Href } from "expo-router";

import type { PushRoute } from "@/lib/push-rules";
import type { UserRole } from "@/lib/types";

/** Where anyone without a session goes. */
export const SIGN_IN_HREF = "/(auth)/sign-in" as Href;

export const ROLE_HREF: Record<UserRole, Href> = {
  customer: "/(customer)" as Href,
  agent: "/(agent)" as Href,
  admin: "/(admin)" as Href,
};

/**
 * The Customer group's screens, named once.
 *
 * The other two groups reach their screens through the helpers below; the
 * Customer Hub and Help home were spelling `/(customer)/…` out at each call
 * site, which made the segment's name a thing eight files agreed about by
 * coincidence. Renaming the route group is what finds them all — and it finds
 * them at runtime, as a route that no longer resolves.
 */
export const CUSTOMER_HREF = {
  messages: "/(customer)/messages" as Href,
  help: "/(customer)/help" as Href,
  wall: "/(customer)/wall" as Href,
  settings: "/(customer)/(home)/settings" as Href,
  search: "/(customer)/(home)/search" as Href,
  faq: "/(customer)/(home)/faq" as Href,
} as const;

/**
 * Where "Back to Messages" goes, for whoever is reading.
 *
 * The three groups spell their inbox differently — a Customer's is `messages`
 * and staff read `conversations` — so the one screen that offers the way out of
 * a thread asks here rather than knowing all three.
 */
export function messagesHref(role: UserRole): Href {
  if (role === "customer") return CUSTOMER_HREF.messages;
  return role === "admin"
    ? ("/(admin)/conversations" as Href)
    : ("/(agent)/conversations" as Href);
}

/** Where a person's Settings screen is, which is where their invitations wait. */
export function settingsHref(role: UserRole): Href {
  if (role === "customer") return CUSTOMER_HREF.settings;
  return role === "admin"
    ? ("/(admin)/(home)/settings" as Href)
    : ("/(agent)/(home)/settings" as Href);
}

/** The screen a tapped notification about no conversation opens, for this role. */
export function pushRouteHref(route: PushRoute, role: UserRole): Href {
  switch (route.screen) {
    case "wall-post":
      // Spelled out rather than taken from `lib/wall-route`'s `wallPostHref`, which builds the
      // same path: this module is on the launch path, and a launch may not load a Wall module
      // (`wall-launch-isolation.test.ts`). The two agree, and that test of the launch says so.
      return { pathname: "/wall/post/[id]", params: { id: route.postId } } as unknown as Href;
    case "invitations":
      return settingsHref(role);
    case "conversations":
      return messagesHref(role);
    case "reports":
      // Only Admins are sent one; anybody else lands on their own inbox rather
      // than on a screen their group does not have.
      return role === "admin" ? ("/(admin)/(home)/reports" as Href) : messagesHref(role);
  }
}

export function knowledgeListHref(group: "agent" | "admin"): Href {
  return group === "admin"
    ? ("/(admin)/knowledge" as Href)
    : ("/(agent)/knowledge" as Href);
}

export function knowledgeHref(group: "agent" | "admin", id: string): Href {
  return group === "admin"
    ? ({ pathname: "/(admin)/(home)/article/[id]", params: { id } } as Href)
    : ({ pathname: "/(agent)/(home)/article/[id]", params: { id } } as Href);
}

export function chartHref(id: string): Href {
  return { pathname: "/(admin)/(home)/chart/[id]", params: { id } } as Href;
}

export function dynamicRouteId(
  raw: string | string[] | undefined,
  pathname: string,
  segment: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw;
  if (fromParams && fromParams !== "[id]") return fromParams;
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.indexOf(segment);
  const next = i >= 0 ? parts[i + 1] : undefined;
  if (!next || next === "[id]") return undefined;
  return decodeURIComponent(next);
}
