import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, MailCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { SIGN_IN_HREF } from "@/lib/hub-routes";
import { magicLinkStage, readLinkToken, readyToVerify } from "@/lib/magic-link-route";
import { settleDownEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";

/**
 * Where a tapped sign-in link lands.
 *
 * This is the whole of what changes between a custom scheme and a real HTTPS
 * domain: the link's origin is configuration, the path is fixed on both sides,
 * and this screen reads the token the same way whichever brought it here.
 *
 * It owns an effect and a flag; every decision it makes is `lib/magic-link-route`.
 * The one thing to notice is that verification is not a second way of signing in
 * — it is the same `submit` and `settled` the sign-in form dispatches, so a
 * verified link, a refused password and an expired session all leave the auth
 * machine in states that were already described and already tested.
 */
export function MagicLinkScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { token: raw } = useLocalSearchParams<{ token?: string | string[] }>();
  const { state, verifyMagicLink } = useAuth();

  const token = readLinkToken(raw);
  /**
   * The two halves of "this token has been spent", which are not the same moment
   * and cannot share a home.
   *
   * `started` is a ref because it guards the request and has to be true the
   * instant the effect fires — a re-render later would be a second link spent.
   * `settled` is state because it is what the screen *shows*: a refusal lands
   * back in `signed-out`, the state the attempt began in, so without it the
   * screen could not tell a refusal from the moment before anything was sent.
   */
  const started = useRef(false);
  const [settled, setSettled] = useState(false);
  const stage = magicLinkStage(token, state, settled);
  const navigated = useRef(false);

  useEffect(() => {
    // `token === null` is restated only so TypeScript narrows it for the call
    // below; the rule itself lives in `readyToVerify` and is not repeated here.
    if (token === null || !readyToVerify(token, state, started.current)) return;

    started.current = true;
    // Recorded when the answer arrives rather than when the request leaves, so
    // there is no frame in which the screen has given up on a link still in the
    // post.
    void verifyMagicLink(token).finally(() => setSettled(true));
  }, [token, state, verifyMagicLink]);

  // Guarded by a ref rather than by the dependency list: `stage` is rebuilt every
  // render, so an effect keyed on it would navigate again on each one.
  useEffect(() => {
    if (stage.kind !== "navigate" || navigated.current) return;
    navigated.current = true;
    hapticSuccess();
    router.replace(stage.href);
  }, [stage]);

  // A refusal is terminal, so the kind alone identifies it and this buzzes once.
  useEffect(() => {
    if (stage.kind === "refused") hapticWarning();
  }, [stage.kind]);

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
          {stage.kind === "refused" ? (
            <AlertCircle color={colors.danger} size={28} />
          ) : (
            <MailCheck color={colors.primary} size={28} />
          )}
        </View>

        {stage.kind === "refused" ? (
          <>
            <Text variant="headline" className="mt-5 text-center text-ink">
              This link didn&rsquo;t work
            </Text>
            <Text
              variant="meta"
              className="mt-2 text-center text-muted"
              accessibilityLiveRegion="polite"
            >
              {stage.message}
            </Text>

            {/* Never a dead end: the way back is also the way to ask for another
                link, since that is where the request lives. */}
            <Button
              className="mt-7 min-h-12 w-full"
              onPress={() => router.replace(SIGN_IN_HREF)}
            >
              <Text>Back to sign in</Text>
            </Button>
          </>
        ) : (
          <>
            <Text variant="headline" className="mt-5 text-center text-ink">
              Signing you in…
            </Text>
            <Text
              variant="meta"
              className="mt-2 text-center text-muted"
              accessibilityLiveRegion="polite"
            >
              Checking your sign-in link.
            </Text>
            <ActivityIndicator className="mt-7" size="small" color={colors.primary} />
          </>
        )}
      </Animated.View>
    </View>
  );
}
