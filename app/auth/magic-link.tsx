import { MagicLinkScreen } from "@/components/auth/magic-link-screen";

/**
 * The route the sign-in link opens: `${origin}/auth/magic-link?token=…`.
 *
 * A real segment rather than the `(auth)` group, because this path is part of the
 * link's contract with the API — the group's parentheses would take it out of the
 * URL, and the link would then land nowhere.
 */
export default function MagicLinkRoute() {
  return <MagicLinkScreen />;
}
