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

import { useRootStackAnimation } from "@/lib/use-stack-chrome";
import { SessionEndRedirect } from "@/components/auth/session-end";
import { PushRegistration } from "@/components/push/push-registration";
import { AuthProvider } from "@/lib/auth-context";
import { ConversationInboxProvider } from "@/lib/conversation-inbox";
import { InAppBannerProvider } from "@/lib/in-app-banner";
import { PushIntentProvider } from "@/lib/push-intent";
import { RealtimeProvider } from "@/lib/realtime-context";
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
  const stackAnimation = useRootStackAnimation();
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
      <AuthProvider>
        <SessionEndRedirect />
        {/* Outside the inbox, because the inbox is one of the things that
            listens to it, and inside the auth provider, because a connection
            needs a session to authenticate its handshake with. */}
        <RealtimeProvider>
          {/* Renders nothing: the permission is asked for at the two moments
              that ask — and once — and this device's push token is kept current,
              both keyed on there being a session. Inside the socket rather than
              beside it, because the second of those moments is a Message
              arriving. */}
          <PushRegistration />
          {/* Inside the auth provider and outside the navigator: the signed-in
            person's conversations are fetched once for every screen that reads
            them, and the chat route sits beside the tab groups rather than
            inside one. */}
          <ConversationInboxProvider>
            {/* Above the navigator, because the tap that started a cold launch
              is reported while the process is still coming up — before any
              screen exists to hear it — and the launch screen reads it from
              here as the third input to its gate. */}
            <PushIntentProvider>
              {/* Above the navigator and outside every screen, because the
                Message a strip names belongs to whichever screen somebody is on
                — which is to say to none of them. It draws over the Stack
                rather than beside it; see `lib/in-app-banner`. */}
              <InAppBannerProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: stackAnimation,
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
                  {/* The two screens a thread's header opens. Beside `chat/[id]`
                    rather than under it: the thread owns that path outright. */}
                  <Stack.Screen
                    name="chat/details/[id]"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  <Stack.Screen
                    name="chat/media/[id]"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  {/* What `View all` opens out of an expanded Community on the
                    Conversation list. Beside the chat routes rather than under a
                    role's tabs, because the Communities tab belongs to all three
                    roles and a Community is a place rather than a destination. */}
                  <Stack.Screen
                    name="community/[id]"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  {/* A named Wall, opened from a link somebody else shared (#79). Beside
                    the chat and community routes for the same reason those are — it is
                    reached from outside whatever the Tab capsule was showing. */}
                  <Stack.Screen
                    name="wall/[id]"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  <Stack.Screen
                    name="(auth)"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  {/* The magic link's landing route. Named here so a cold start opened by
                    a link gets the same chrome as every other screen rather than the
                    navigator's defaults. */}
                  <Stack.Screen
                    name="auth/magic-link"
                    options={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                </Stack>
              </InAppBannerProvider>
            </PushIntentProvider>
          </ConversationInboxProvider>
        </RealtimeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
