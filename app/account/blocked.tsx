import { AccountBlockedScreen } from "@/components/settings/account-blocked-screen";

/**
 * The people this account has blocked (App Store guideline 1.2), reached from
 * the account card on Settings. A sibling of the role groups per ADR-0012, like
 * the other account screens.
 */
export default function AccountBlockedRouteScreen() {
  return <AccountBlockedScreen />;
}
