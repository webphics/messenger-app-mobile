import { useMemo } from "react";
import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname } from "expo-router";

import { SharedWallScreen } from "@/components/wall/shared-wall-screen";
import { sharedWallIdFromRoute } from "@/lib/wall-route";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";

/**
 * A named Wall, opened from a link somebody else made and shared (#79).
 *
 * Beside the chat and community routes rather than under a role's tabs, for
 * the reason they are: it is reached from outside whatever the Tab capsule was
 * showing when the link was tapped, and every role opens the same screen —
 * `docs/api/wall.md` draws no line between them on reading.
 */
export default function SharedWallRouteScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () => sharedWallIdFromRoute(local, pathname) ?? sharedWallIdFromRoute(global, pathname),
    [local, global, pathname],
  );

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <SharedWallScreen wallId={id} />;
}
