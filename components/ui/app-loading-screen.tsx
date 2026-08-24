import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
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
  /**
   * Called once the launch WebP has decoded and is on screen (or the decode
   * failsafe fired). The parent starts its minimum-display window from here so
   * the animation gets its full run instead of being cut short by decode time.
   */
  onReady?: () => void;
  /** Colour shown behind the transparent animation. */
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
  const animation = launchAnimationSize(screenWidth);
  const opacity = useSharedValue(1);
  const readyRef = useRef(false);
  // Read through a ref so an inline `onReady` cannot restart the failsafe timer.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /**
   * Hold the native splash until the launch WebP has decoded so the handoff is
   * icon → character animation, never a blank frame. Root layout has a longer
   * backstop if this screen never mounts.
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
        // Decode straight from the bundled asset; a disk round-trip on a 4 MB
        // WebP is the difference between a played animation and a flash of one.
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
