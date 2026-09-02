import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CloudOff } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { settleDownEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";

/**
 * The Unreachable cold start: a Session cookie is held, but the API did not answer.
 *
 * Deliberately not the sign-in screen. The credential is probably still good, so
 * sending someone to retype a password because their train went into a tunnel
 * would be both wrong and annoying. Retry is the primary way out; signing out is
 * offered too, so this is never a dead end.
 */
export function UnreachableScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { retry, signOut } = useAuth();

  return (
    <View
      className="flex-1 items-center justify-center bg-bg px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
    >
      <Animated.View
        entering={settleDownEnter(!!reduceMotion)}
        className="w-full items-center"
      >
        <View className="size-16 items-center justify-center rounded-3xl bg-primary-soft">
          <CloudOff color={colors.primary} size={28} />
        </View>

        <Text variant="headline" className="mt-5 text-center text-ink">
          Can&rsquo;t reach Enki
        </Text>
        {/* Deliberately covers both ways Hydration can end here: no answer at all,
            and an answer this app could not read. Naming only the first would be
            wrong half the time, and the person cannot act differently either way. */}
        <Text variant="meta" className="mt-2 text-center text-muted">
          You&rsquo;re still signed in — Enki just couldn&rsquo;t get a usable answer from
          the server. Check your connection and try again.
        </Text>

        <Button className="mt-7 min-h-12 w-full" onPress={retry}>
          <Text>Try again</Text>
        </Button>

        <Button
          variant="ghost"
          className="mt-2 min-h-11 w-full"
          // `components/auth/session-end` does the navigating, here as in Settings.
          onPress={() => {
            void signOut();
          }}
        >
          <Text className="text-muted">Sign out</Text>
        </Button>
      </Animated.View>
    </View>
  );
}
