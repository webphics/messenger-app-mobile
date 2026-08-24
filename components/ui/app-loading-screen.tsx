import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { launchAnimationSize } from "@/lib/launch-animation";
import { colors } from "@/lib/tokens";

/**
 * Animated WebP rather than video: it is the only format that renders a real
 * alpha channel on both iOS and Android. `expo-video` composites onto an
 * opaque surface, and AVFoundation cannot demux WebM at all.
 */
const LAUNCH_ANIMATION = require("@/assets/images/launch-animation.webp");

/** Hide native splash if WebP onLoad never fires (slow tunnel / decode stall). */
const SPLASH_FALLBACK_MS = 2500;

export type AppLoadingScreenProps = {
  /** If true, triggers the smooth fade-out exit transition */
  isFinishing?: boolean;
  /** Called when the exit fade animation finishes */
  onFinish?: () => void;
  /** Colour shown behind the transparent animation. */
  backgroundColor?: string;
};

export function AppLoadingScreen({
  isFinishing = false,
  onFinish,
  backgroundColor = colors.bg,
}: AppLoadingScreenProps) {
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const animation = launchAnimationSize(screenWidth);
  const opacity = useSharedValue(1);

  /**
   * Keep the native splash until the launch WebP has decoded so the handoff is
   * icon → character animation (not a blank white frame). Root layout has a
   * longer failsafe if this screen never mounts.
   */
  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  useEffect(() => {
    if (isFinishing) {
      if (reduceMotion) {
        opacity.value = 0;
        onFinish?.();
      } else {
        opacity.value = withTiming(0, { duration: 300 }, (finished) => {
          if (finished && onFinish) {
            runOnJS(onFinish)();
          }
        });
      }
    }
  }, [isFinishing, reduceMotion, onFinish, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      aria-label="Loading Enki…"
      style={[styles.container, { backgroundColor }, animatedStyle]}
    >
      <Image
        source={LAUNCH_ANIMATION}
        style={{ width: animation.width, height: animation.height }}
        contentFit="contain"
        // Reduced motion holds the first frame instead of looping.
        autoplay={!reduceMotion}
        transition={0}
        onLoad={hideSplash}
        onError={hideSplash}
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
