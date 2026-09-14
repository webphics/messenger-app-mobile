import { useMemo } from "react";
import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname } from "expo-router";

import { CommunityScreen } from "@/components/communities/community-screen";
import { communityIdFromRoute } from "@/lib/community-route";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";

/**
 * One Community, reached from `View all` at the end of an expanded Community on
 * the Conversation list.
 *
 * Beside the chat routes rather than under a role's tabs, for the reason they
 * are: the Communities tab belongs to every role, and a Community is a place
 * rather than a destination on the capsule.
 */
export default function CommunityRouteScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const role = getSession().role;

  const id = useMemo(
    () => communityIdFromRoute(local, pathname) ?? communityIdFromRoute(global, pathname),
    [local, global, pathname],
  );

  if (!id) return <Redirect href={ROLE_HREF[role]} />;

  return <CommunityScreen communityId={id} />;
}
