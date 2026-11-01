import { AccountTwoFactorScreen } from "@/components/settings/account-two-factor-screen";

/**
 * Two-factor authentication (#07), reached from the account card on Settings. It
 * takes no params: there is exactly one account this phone is signed in to, and
 * the state it reports is carried on that person rather than fetched.
 *
 * A sibling of the role groups rather than a screen inside one, per ADR-0012:
 * governing your own account belongs to the account and not to the role.
 *
 * This is the whole of two-factor management on this client, turning it on
 * included (#08): the setup is a card on this screen rather than a route of its
 * own, because its key and codes exist only in the answer that minted them.
 */
export default function AccountTwoFactorRouteScreen() {
  return <AccountTwoFactorScreen />;
}
