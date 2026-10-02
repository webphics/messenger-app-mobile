import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { easing } from "@/lib/motion-easing";
import { colors } from "@/lib/tokens";

/** The ChatRoute mark, still. Its intrinsic size is 720x406. */
const LAUNCH_MARK = require("@/assets/images/launch-mark.png");
const LAUNCH_MARK_ASPECT = 720 / 406;

/**
 * 85% of the screen, capped so the mark never dominates a tablet. Clamped at
 * zero because the window can report a width of 0 before it is measured.
 */
const LAUNCH_MARK_MAX_WIDTH = 360;

/** Hide native splash if the mark's onLoad never fires (slow tunnel / decode stall). */
const SPLASH_FALLBACK_MS = 2500;

export type AppLoadingScreenProps = {
  /** If true, triggers the smooth fade-out exit transition */
  isFinishing?: boolean;
  /** Called when the exit fade animation finishes */
  onFinish?: () => void;
  /**
   * Called once the mark has decoded and the native splash is hidden (or the
   * decode failsafe fired). Until then the parent must keep this screen
   * mounted, because this screen is what hides the native splash.
   */
  onReady?: () => void;
  /** Colour shown behind the transparent mark. */
  backgroundColor?: string;
};

export function AppLoadingScreen({
  isFinishing = false,
  onFinish,
  onReady,
  backgroundColor = colors.bg,
}: AppLoadingScreenProps) {
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const markWidth = Math.max(0, Math.min(screenWidth * 0.85, LAUNCH_MARK_MAX_WIDTH));
  const opacity = useSharedValue(1);
  const readyRef = useRef(false);
  // Read through a ref so an inline `onReady` cannot restart the failsafe timer.
  // Assigned in an effect rather than during render: `markReady` only ever runs
  // from the failsafe timer or the image's onLoad/onError, all of which fire
  // after commit, so the ref is always current by the time it is read.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  /**
   * Hold the native splash until the mark has decoded so the handoff is
   * icon → mark, never a blank frame. Root layout has a longer backstop if
   * this screen never mounts.
   */
  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
    onReadyRef.current?.();
  }, []);

  useEffect(() => {
    const timer = setTimeout(markReady, SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [markReady]);

  useEffect(() => {
    if (isFinishing) {
      if (reduceMotion) {
        opacity.set(0);
        onFinish?.();
      } else {
        opacity.set(
          withTiming(0, { duration: 300, easing: easing.out }, (finished) => {
            if (finished && onFinish) {
              scheduleOnRN(onFinish);
            }
          }),
        );
      }
    }
  }, [isFinishing, reduceMotion, onFinish, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      aria-label="Loading ChatRoute…"
      style={[styles.container, { backgroundColor }, animatedStyle]}
    >
      <Image
        source={LAUNCH_MARK}
        style={{ width: markWidth, height: markWidth / LAUNCH_MARK_ASPECT }}
        contentFit="contain"
        transition={0}
        cachePolicy="memory-disk"
        priority="high"
        onLoad={markReady}
        onError={markReady}
        aria-hidden
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
