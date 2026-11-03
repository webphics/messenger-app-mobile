import { AccountProfileScreen } from "@/components/settings/account-profile-screen";

/**
 * The signed-in person's own name, username, phone and photo, reached from the
 * header card on Settings. No params: it is always the caller's own profile,
 * and a sibling of the other account screens per ADR-0012.
 */
export default function AccountProfileRouteScreen() {
  return <AccountProfileScreen />;
}
