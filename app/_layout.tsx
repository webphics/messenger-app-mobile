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
import { useEffect } from "react";
import { Appearance, AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";

import { colors } from "@/lib/tokens";

Uniwind.setTheme("light");
Appearance.setColorScheme("light");

function applyAndroidNavChrome() {
  NavigationBar.setHidden(false);
  NavigationBar.setStyle("dark");
}

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

  useEffect(() => {
    void SplashScreen.hideAsync();
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
