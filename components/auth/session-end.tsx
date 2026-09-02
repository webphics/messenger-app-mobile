import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth-context";
import { sessionEndHref } from "@/lib/session-end";

/**
 * Renders nothing; watches for a session ending and lands the person on sign-in.
 *
 * Mounted once, above the router's screens, because the two ways a session ends
 * do not both have a screen to navigate from. Signing out does — Settings, and
 * the Unreachable screen — but an expiry has no button behind it and no screen
 * that owns it. Leaving each screen to route for itself would mean the expiry
 * path had nowhere to live, which is how someone ends up staring at an inbox
 * that has quietly stopped loading.
 *
 * The decision itself is `lib/session-end`; what is here is only the effect.
 */
export function SessionEndRedirect() {
  const { state } = useAuth();
  // The status held before, not the current one: "signed out" alone cannot tell a
  // cold start from someone being put out of a live session.
  const previous = useRef(state.status);

  useEffect(() => {
    const href = sessionEndHref({ from: previous.current, to: state.status });
    previous.current = state.status;
    if (href) router.replace(href);
  }, [state.status]);

  return null;
}
