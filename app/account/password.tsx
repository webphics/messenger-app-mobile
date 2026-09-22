import { AccountPasswordScreen } from "@/components/settings/account-password-screen";

/**
 * Setting or changing this account's password (#06), reached from the account
 * card on Settings. It takes no params: there is exactly one password screen,
 * and it is always the signed-in caller's own.
 *
 * It takes no mode either. Which of the two things it is doing is read off the
 * signed-in person's `hasPassword` by `lib/password-rules`, rather than being
 * carried in the address, so there is no way to arrive at the wrong one.
 *
 * A sibling of the role groups rather than a screen inside one, per ADR-0012:
 * governing your own account belongs to the account and not to the role.
 */
export default function AccountPasswordRouteScreen() {
  return <AccountPasswordScreen />;
}
