import { AccountDeleteScreen } from "@/components/settings/account-delete-screen";

/**
 * Deleting this account, reached from the account card on Settings. No params:
 * it is always the signed-in caller's own account. A sibling of the role groups
 * per ADR-0012, like the password and two-factor screens.
 */
export default function AccountDeleteRouteScreen() {
  return <AccountDeleteScreen />;
}
