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
import { useViewer } from "@/lib/use-viewer";
import { SessionEndRedirect } from "@/components/auth/session-end";
import { TermsRedirect } from "@/components/auth/terms-redirect";
import { PushRegistration } from "@/components/push/push-registration";
import { UpdateGate } from "@/components/update/update-gate";
import { AuthProvider } from "@/lib/auth-context";
import { BlocksProvider } from "@/lib/blocks-context";
import { ConversationInboxProvider } from "@/lib/conversation-inbox";
import { InAppBannerProvider } from "@/lib/in-app-banner";
import { NotificationBadgeProvider } from "@/lib/notification-badge";
import { PushIntentProvider } from "@/lib/push-intent";
import { RealtimeProvider } from "@/lib/realtime-context";
import { ROLE_GROUP_ACCESS, mayEnter } from "@/lib/route-access";
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
  // mount. Do NOT hide it eagerly here: the launch screen owns the handoff.
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
        {/* Beside it: the terms gate has moments without a screen too — a
            session read or a `terms_required` refusal. */}
        <TermsRedirect />
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
                {/* Inside the socket, which keeps the count current, and
                  above the navigator, because the bell on the Hub and the
                  Notifications screen both move it and must agree. */}
                <NotificationBadgeProvider>
                  {/* Above the navigator, because the Wall, an open thread
                    and Settings all read who is blocked and must agree the
                    moment a block lands. See `lib/blocks-context`. */}
                  <BlocksProvider>
                    <RootStack animation={stackAnimation} />
                  </BlocksProvider>
                </NotificationBadgeProvider>
              </InAppBannerProvider>
            </PushIntentProvider>
          </ConversationInboxProvider>
        </RealtimeProvider>
      </AuthProvider>
      {/* Last, so it draws over every screen and every banner. Outside the
          providers because it needs none of them: a build the API refuses is
          refused whoever is signed in. */}
      <UpdateGate />
    </GestureHandlerRootView>
  );
}

/**
 * The root navigator. Its own component, inside the providers, because the
 * guards on the role groups read the signed-in person and `RootLayout` sits
 * outside the `AuthProvider` that holds them.
 */
function RootStack({
  animation,
}: {
  animation: ReturnType<typeof useRootStackAnimation>;
}) {
  const viewer = useViewer();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation,
        gestureEnabled: true,
      }}
    >
      {/* First, and named, because a route group is not part of a
        path: each role's `(home)/index` is `/` exactly as this one
        is, and every native launch starts at `/`. Left to the file
        system, expo-router broke that tie for the Customer Hub, so
        a cold start opened on the Hub with nobody signed in and the
        Launch gate never ran. Declared first, with the three groups
        named after it, the launch screen is the match. */}
      <Stack.Screen name="index" />
      {/* Each role enters its own group and no other, and nobody enters one
        before Hydration has said who they are. A group left out of the
        navigator is what turns a deep link into another role's screens —
        `/users` typed by an Agent — into this launch screen, whose gate then
        hands over the person's own Hub. See `lib/route-access`. */}
      <Stack.Protected guard={mayEnter(viewer, ROLE_GROUP_ACCESS.customer)}>
        <Stack.Screen name="(customer)" />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, ROLE_GROUP_ACCESS.agent)}>
        <Stack.Screen name="(agent)" />
      </Stack.Protected>
      <Stack.Protected guard={mayEnter(viewer, ROLE_GROUP_ACCESS.admin)}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
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
      {/* This person's own Saved view (#84), reached from the Wall's header
        rather than the Tab capsule. Beside `wall/[id]` for the same reason
        that route sits here rather than under a role's tabs. */}
      <Stack.Screen
        name="wall/saved"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* The notification feed, reached from the bell on the Hub. Beside
        Saved and the account screens rather than inside a role group:
        every role has the same feed, scoped by the API to the caller. */}
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Where this account is signed in (#05), pushed from the
        account card on Settings. Outside the three role groups
        rather than inside one, per ADR-0012: governing your own
        account belongs to the account and not to the role, and the
        Settings screen that pushes here is already the one shared
        component all three groups render. The password and
        two-factor screens below are siblings for the same reason. */}
      <Stack.Screen
        name="account/sessions"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Name, username, phone and photo, pushed from the header card
        on Settings. A sibling of the account screens around it for the
        same reason they are. */}
      <Stack.Screen
        name="account/profile"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Setting a first password or changing one (#06). It carries
        no mode in its address: which of the two it is doing is read
        off the signed-in person, so there is no way to arrive at the
        wrong one. */}
      <Stack.Screen
        name="account/password"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Two-factor (#07, #08): the state, turning it on and off, and
        fresh backup codes. */}
      <Stack.Screen
        name="account/two-factor"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* The people this account has blocked, and unblocking them. A sibling
        of the account screens above for the same reason they are. */}
      <Stack.Screen
        name="account/blocked"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Deleting this account, which the stores require of an app that
        creates accounts. A sibling of the screens above for the same
        reason they are. */}
      <Stack.Screen
        name="account/delete"
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
  );
}
