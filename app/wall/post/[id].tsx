import { useMemo } from "react";
import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname } from "expo-router";

import { WallPostScreen } from "@/components/wall/wall-post-screen";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";
import { wallPostIdFromRoute } from "@/lib/wall-route";

/**
 * One Post, opened from the Hub's carousel.
 *
 * Beside the shared-Wall route rather than under it, for the reason that one
 * sits outside a role's tabs: it is reached from whatever the Tab capsule was
 * showing, and every role opens the same screen.
 */
export default function WallPostRouteScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () => wallPostIdFromRoute(local, pathname) ?? wallPostIdFromRoute(global, pathname),
    [local, global, pathname],
  );

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <WallPostScreen postId={id} />;
}
