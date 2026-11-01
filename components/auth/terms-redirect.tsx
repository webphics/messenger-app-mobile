import { router, usePathname } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import { termsRedirect } from "@/lib/onboarding-gate";

/**
 * Renders nothing; sends a signed-in person who owes the Terms of Use to the
 * terms gate from wherever they are.
 *
 * Mounted once beside `SessionEndRedirect`, for the same reason: the moments
 * that make it true have no screen of their own. A session read can replace a
 * person this device kept from an older build (no answer either way) with the
 * API's null, and any request can be refused with `terms_required`; both land
 * on whatever screen happened to be open. The decision is `termsRedirect`.
 */
export function TermsRedirect() {
  const { state } = useAuth();
  const pathname = usePathname();
  const user = state.status === "signed-in" ? state.user : null;

  useEffect(() => {
    const href = termsRedirect(user, pathname);
    if (href) router.replace(href);
  }, [user, pathname]);

  return null;
}
