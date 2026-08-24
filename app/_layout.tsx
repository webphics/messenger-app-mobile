// Gesture Handler requires this side-effect import to run before any other
// import in the entry file, so it has to stay pinned at line 1. Kept separate
// from the `GestureHandlerRootView` import below for that reason — merging them
// to satisfy import/no-duplicates would drag a named import up here and hide
// why this line has to lead.
// eslint-disable-next-line import/no-duplicates
import "react-native-gesture-handler";
import "../global.css";

// Per-face subpaths, never the package root: the root index `require()`s every
// weight in the family, so a barrel import bundles all 7 Manrope and all 16
// JetBrains Mono TTFs whether or not they are loaded here.
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { useFonts } from "expo-font";
import { NavigationBar } from "expo-navigation-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Appearance, AppState, Platform } from "react-native";
// eslint-disable-next-line import/no-duplicates -- see the leading side-effect import
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";

import { colors } from "@/lib/tokens";

Uniwind.setTheme("light");
Appearance.setColorScheme("light");
// The decor view is what shows through the strips MainActivity pads for the
// system bars; AppTheme's DayNight parent paints it black on dark-mode phones.
// The prebuild plugin does this natively for frame zero — this covers the dev
// client, where that plugin has not run.
void SystemUI.setBackgroundColorAsync(colors.bg);
void SplashScreen.preventAutoHideAsync().catch(() => {});

function applyAndroidNavChrome() {
  NavigationBar.setHidden(false);
  NavigationBar.setStyle("dark");
}

function hideNativeSplash() {
  void SplashScreen.hideAsync().catch(() => {});
}

/**
 * Backstop only. `AppLoadingScreen` hides the native splash the moment the
 * launch WebP has decoded, which is what makes the handoff icon -> character
 * animation instead of a blank frame. This timer exists solely so a failure to
 * mount that screen at all cannot strand the splash forever, so it must sit
 * well past the WebP's own decode failsafe.
 */
const SPLASH_BACKSTOP_MS = 6000;

export default function RootLayout() {
  useFonts({
    Manrope: Manrope_400Regular,
    "Manrope-Medium": Manrope_500Medium,
    "Manrope-SemiBold": Manrope_600SemiBold,
    "Manrope-Bold": Manrope_700Bold,
    "Manrope-ExtraBold": Manrope_800ExtraBold,
    "JetBrains Mono": JetBrainsMono_500Medium,
    "JetBrains Mono-Bold": JetBrainsMono_700Bold,
  });

  // Never leave the native splash up if the index loading screen fails to
  // mount. Do NOT hide it eagerly here: the launch animation owns the handoff.
  useEffect(() => {
    const timer = setTimeout(hideNativeSplash, SPLASH_BACKSTOP_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    applyAndroidNavChrome();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") applyAndroidNavChrome();
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      {Platform.OS === "android" ? (
        <NavigationBar hidden={false} style="dark" />
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "default",
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
