import { Platform, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { initialWindowMetrics } from "react-native-safe-area-context";

import { MessageCircle, X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { settleDownEnter, settleUpExit } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";
import type { BannerNotice } from "@/lib/banner-notice";

/**
 * The In-app banner, drawn.
 *
 * Presentation only: what earns one is `lib/banner-notice`, and when one appears
 * and how long it stays is `lib/in-app-banner`. It sits over whatever screen is
 * up rather than inside one, because the Message it names belongs to none of
 * them.
 */

/**
 * How far down the strip starts.
 *
 * Nothing on Android, where `plugins/with-system-bar-insets` pads the window's
 * content view by the system bars natively — so the top of this tree is already
 * below the status bar and an inset here would be the second one. iOS has no
 * such padding and no navigator above this to read insets from either, so the
 * window's own metrics answer, taken once at launch: a strip at the top of the
 * screen has nothing to re-measure for.
 */
const TOP_INSET =
  Platform.OS === "ios" ? (initialWindowMetrics?.insets.top ?? 0) : 0;

/** What a screen reader is given for the strip, since it is one control. */
function accessibleName({ sender, preview }: BannerNotice): string {
  return preview
    ? `${sender}: ${preview}. Open conversation`
    : `${sender}. Open conversation`;
}

export function BannerStrip({
  notice,
  onOpen,
  onDismiss,
}: {
  notice: BannerNotice;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={settleDownEnter(!!reduceMotion)}
      exiting={settleUpExit(!!reduceMotion)}
      // Announced where it is drawn rather than on the pressable inside it, and
      // politely: somebody is reading or typing something else, and this is
      // never worth cutting into that. Nothing here takes focus.
      accessibilityLiveRegion="polite"
      // The strip is the only thing in this layer; everything around it belongs
      // to the screen underneath and has to stay reachable.
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 px-3"
      style={{ paddingTop: TOP_INSET + 8, zIndex: 50 }}
    >
      {/* Two controls side by side rather than one inside the other. A
          `Pressable` is an accessibility element by default and collapses what
          it contains, so a dismiss button nested in the strip would have had a
          label no screen reader could reach — and dismissing is the only way
          out of the strip that is not opening the thread. */}
      <View
        className="flex-row items-center rounded-2xl border border-line/70 bg-surface pr-1 shadow-lg shadow-black/10"
        style={{ elevation: 8 }}
      >
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={accessibleName(notice)}
          onPress={onOpen}
          className="min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl py-3 pl-3.5"
        >
          <View
            // Decorative: the label above already says what this is.
            importantForAccessibility="no"
            accessibilityElementsHidden
            className="size-9 items-center justify-center rounded-full bg-primary/10"
          >
            <MessageCircle color={colors.primary} size={18} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="title" className="text-ink" numberOfLines={1}>
              {notice.sender}
            </Text>
            {notice.preview ? (
              <Text variant="meta" className="text-muted" numberOfLines={1}>
                {notice.preview}
              </Text>
            ) : null}
          </View>
        </TactilePressable>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          // A 16px glyph, so the touchable it stands for is drawn out to what a
          // finger needs rather than to what the design put there.
          hitSlop={14}
          onPress={onDismiss}
          className="shrink-0 p-2.5 active:opacity-60"
        >
          <X color={colors.muted} size={16} />
        </TactilePressable>
      </View>
    </Animated.View>
  );
}
