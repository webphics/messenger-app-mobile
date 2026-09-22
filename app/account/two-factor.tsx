import { AccountTwoFactorScreen } from "@/components/settings/account-two-factor-screen";

/**
 * Two-factor authentication (#07), reached from the account card on Settings. It
 * takes no params: there is exactly one account this phone is signed in to, and
 * the state it reports is carried on that person rather than fetched.
 *
 * A sibling of the role groups rather than a screen inside one, per ADR-0012:
 * governing your own account belongs to the account and not to the role.
 *
 * This is the whole of two-factor management on this client. There is no route
 * for turning it on, because there is no screen for it: ticket 08 is blocked on
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`,
 * and ADR-0013 records why.
 */
export default function AccountTwoFactorRouteScreen() {
  return <AccountTwoFactorScreen />;
}
