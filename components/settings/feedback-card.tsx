import { router, type Href } from "expo-router";
import { View } from "react-native";

import { Bug, ChevronRight, MessageSquare, type IconComponent } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import type { FeedbackKind } from "@/lib/feedback-parse";
import { colors } from "@/lib/tokens";

/**
 * The way to report a bug or send feedback about the app, on the one shared
 * Settings screen and so on every role's: the API takes one from anybody signed
 * in, and an Agent hitting a broken composer is as much a reporter as a
 * Customer is. Both rows push the same form, opened on their kind.
 */

const ROWS: { kind: FeedbackKind; icon: IconComponent; title: string; hint: string }[] = [
  { kind: "bug_report", icon: Bug, title: "Report a bug", hint: "Something isn’t working as it should" },
  { kind: "feedback", icon: MessageSquare, title: "Send feedback", hint: "An idea, or what you think of the app" },
];

export function feedbackNewHref(kind: FeedbackKind): Href {
  return { pathname: "/feedback/new", params: { kind } } as unknown as Href;
}

export function FeedbackCard() {
  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
      <View className="mb-3 border-b border-line/60 pb-3">
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Help improve ChatRoute
        </Text>
      </View>

      {ROWS.map((row) => {
        const Icon = row.icon;
        return (
          <TactilePressable
            key={row.kind}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            accessibilityHint={row.hint}
            onPress={() => router.push(feedbackNewHref(row.kind))}
            className="min-h-12 flex-row items-center gap-3 py-1.5"
          >
            <Icon color={colors.primary} size={18} />
            <View className="min-w-0 flex-1">
              <Text variant="meta" className="font-semibold text-ink" numberOfLines={1}>
                {row.title}
              </Text>
              <Text variant="meta" className="text-muted" numberOfLines={1}>
                {row.hint}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={16} />
          </TactilePressable>
        );
      })}
    </View>
  );
}
