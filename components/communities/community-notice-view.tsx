import { ActivityIndicator, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { CloudOff, Users, type IconComponent } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { settleEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";

/**
 * What a Communities surface says when it has no rows to draw.
 *
 * One component for the tab and the Community screen, because they are asking
 * the same question of different lists and would otherwise answer it twice, in
 * two places that could drift. Which of the three states this is, and the words
 * in it, are decided in `lib/community-notice` — this only draws them.
 */

/** A first read still out. A spinner rather than an empty list, which would be a lie. */
export function CommunityLoading({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} className="items-center py-16">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

type CommunityNoticeViewProps = {
  title: string;
  hint: string;
  /** A read that did not land, rather than a settled answer about this person. */
  failed: boolean;
  onRetry?: () => void;
  /** What a settled answer is drawn with. People, unless the list is not of people. */
  icon?: IconComponent;
};

export function CommunityNoticeView({
  title,
  hint,
  failed,
  onRetry,
  icon: Icon = Users,
}: CommunityNoticeViewProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      accessibilityLiveRegion={failed ? "polite" : "none"}
      className="items-center px-4 py-16"
    >
      <View
        className={`size-14 items-center justify-center rounded-full ${
          failed ? "bg-danger/10" : "bg-primary-soft"
        }`}
      >
        {failed ? (
          <CloudOff color={colors.danger} size={26} />
        ) : (
          <Icon color={colors.primary} size={26} />
        )}
      </View>
      <Text variant="title" className="mt-4 text-ink">
        {title}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {hint}
      </Text>
      {onRetry ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
        >
          <Text variant="label" className="font-bold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  );
}
