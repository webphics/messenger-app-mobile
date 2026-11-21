import { useCallback, useEffect } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { shouldRefreshSessionUser } from "@/lib/session-refresh";

/**
 * Shared by every screen that calls this, so pushing the password screen right
 * after the two-factor one is one read rather than two.
 */
let lastRefreshAt: number | null = null;

/**
 * Re-read the signed-in person when the calling screen opens and whenever the
 * app returns to the foreground while it is open, throttled by
 * `shouldRefreshSessionUser`. The answer replaces the person in the auth state
 * (`reconfirmSession`), so a status another device changed redraws in place.
 *
 * Returns `refreshNow`, unthrottled, for an answer that has just proved the
 * copy out of date.
 */
export function useSessionUserRefresh(): { refreshNow: () => void } {
  const { reconfirmSession } = useAuth();

  const refreshNow = useCallback(() => {
    lastRefreshAt = Date.now();
    reconfirmSession();
  }, [reconfirmSession]);

  useEffect(() => {
    const refreshIfDue = () => {
      if (shouldRefreshSessionUser(lastRefreshAt, Date.now())) refreshNow();
    };

    refreshIfDue();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshIfDue();
    });

    return () => {
      subscription.remove();
    };
  }, [refreshNow]);

  return { refreshNow };
}
