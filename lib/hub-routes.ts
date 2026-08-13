import type { Href } from "expo-router";

import type { UserRole } from "@/lib/types";

export const ROLE_HREF: Record<UserRole, Href> = {
  contact: "/(contact)" as Href,
  agent: "/(agent)" as Href,
  admin: "/(admin)" as Href,
};

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
  return { pathname: "/(admin)/chart/[id]", params: { id } } as unknown as Href;
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
