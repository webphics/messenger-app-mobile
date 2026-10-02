import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Settings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { settleDownEnter } from "@/lib/motion-enter";
import {
  needsSystemNotificationSettings,
  openSystemNotificationSettings,
} from "@/lib/push-device";
import { colors } from "@/lib/tokens";

/**
 * The way back for somebody whose notifications are off.
 *
 * Renders nothing at all until the operating system's own settings are the only
 * place the answer can still be changed — which is `lib/push-rules`' decision,
 * not this screen's. Both moments that ask do so once, because both platforms
 * draw their dialog once; when neither will ask again, a person who wants
 * notifications has nowhere to go and no way to know it, and this is the whole
 * of the answer to that. It is a card on a screen somebody chose to open: no
 * prompt, no banner, nothing that arrives uninvited.
 *
 * ## Why it is a card of its own, and the last one
 *
 * Whether it appears at all is settled by a read of the platform, which lands a
 * frame or two after this screen has drawn. Anywhere above Sign out, that is a
 * destructive control moving under somebody's thumb as they reach for it; below
 * everything, the same read costs nothing anybody was already aiming at.
 *
 * ## Why it is read again on every foreground
 *
 * The route leads out of the app, and the answer changes while this app is not
 * running — that is what somebody was sent out to do. So coming back re-reads
 * it, and the card is gone by the time they are looking at this screen again.
 * Nothing else moves the answer: the two triggers cannot run while a person is
 * standing on Settings with this card in front of them, because a card in front
 * of them means neither will ever ask again.
 */
export function NotificationPermissionRow() {
  const [offered, setOffered] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let live = true;
    const read = () => {
      void needsSystemNotificationSettings().then((needed) => {
        if (live) setOffered(needed);
      });
    };

    read();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") read();
    });

    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  if (!offered) return null;

  return (
    <Animated.View
      entering={settleDownEnter(!!reduceMotion)}
      className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
    >
      <View className="mb-4 border-b border-line/60 pb-3">
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Notifications
        </Text>
      </View>

      <Text variant="label" className="mb-3 font-normal leading-5 text-muted">
        Notifications are turned off for ChatRoute. Your phone’s settings are the only
        place to turn them back on.
      </Text>

      <Button
        variant="outline"
        className="min-h-12"
        onPress={() => {
          void openSystemNotificationSettings();
        }}
      >
        <Settings color={colors.ink} size={18} />
        <Text>Open phone settings</Text>
      </Button>
    </Animated.View>
  );
}
