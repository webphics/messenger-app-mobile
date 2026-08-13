import "react-native-gesture-handler";
import "../global.css";

import {
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    useFonts,
} from "@expo-google-fonts/manrope";
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
