import { AccountSessionsScreen } from "@/components/settings/account-sessions-screen";

/**
 * Where this account is signed in (#05), reached from the account card on
 * Settings. It takes no params: there is exactly one session list, and it is
 * always the signed-in caller's own, scoped by the API to the cookie the request
 * went under.
 *
 * A sibling of the role groups rather than a screen inside one, per ADR-0012:
 * governing your own account belongs to the account and not to the role.
 */
export default function AccountSessionsRouteScreen() {
  return <AccountSessionsScreen />;
}
