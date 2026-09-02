import type { Href } from "expo-router";

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
  settings: "/(customer)/(home)/settings" as Href,
  search: "/(customer)/(home)/search" as Href,
  faq: "/(customer)/(home)/faq" as Href,
} as const;

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
