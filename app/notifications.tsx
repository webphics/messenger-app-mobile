import { NotificationsScreen } from "@/components/notifications/notifications-screen";

/**
 * This person's notification feed, reached from the bell on the Hub. It takes
 * no params: there is exactly one feed, and it is always the signed-in caller's
 * own, scoped by the API.
 *
 * A sibling of the role groups rather than a screen inside one, like Saved and
 * the account screens: every role has the same feed.
 */
export default function NotificationsRouteScreen() {
  return <NotificationsScreen />;
}
