import { useLocalSearchParams } from "expo-router";

import { FeedbackFormScreen } from "@/components/settings/feedback-form-screen";

/**
 * Reporting a bug or sending feedback, reached from Settings. Every role files
 * one, so it lives beside `account/` rather than inside a role group, as the
 * web's `/feedback/new` does. `?kind=feedback` opens it on Feedback; anything
 * else opens it on a bug report, as on web.
 */
export default function FeedbackNewRouteScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string | string[] }>();
  const value = Array.isArray(kind) ? kind[0] : kind;
  return <FeedbackFormScreen initialKind={value === "feedback" ? "feedback" : "bug_report"} />;
}
