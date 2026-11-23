import { useLocalSearchParams, usePathname } from "expo-router";

import { FeedbackEntryScreen } from "@/components/hub/feedback-entry-screen";
import { dynamicRouteId } from "@/lib/hub-routes";

export default function AdminFeedbackEntryScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  return <FeedbackEntryScreen id={dynamicRouteId(id, pathname, "feedback-entry")} />;
}
