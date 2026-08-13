import { Platform } from "react-native";

/** Gap below the status bar on headerless screens (hub, search, chat). */
export const SCREEN_TOP_EXTRA = 12;

export function screenTopPad(insetTop: number) {
  return insetTop + SCREEN_TOP_EXTRA;
}

/** System nav / home-indicator inset, plus optional extra content gap. */
export function screenBottomPad(insetBottom: number, extra = 0) {
  return insetBottom + extra;
}

/** Hex copies of `global.css` @theme. Native headers/tabs cannot use className. */
export const colors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  ink: "#14161F",
  inkSoft: "#3A3D4A",
  muted: "#6B7280",
  line: "#E4E6EC",
  primary: "#3452D9",
  primaryForeground: "#FFFFFF",
  success: "#1F9D6C",
  danger: "#D64545",
  amber: "#E2831C",
} as const;

const headerChrome = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerTitleStyle: {
    color: colors.ink,
    fontFamily: "Manrope-SemiBold",
    fontWeight: "600" as const,
  },
  headerShadowVisible: false,
  // MainActivity already pads android.R.id.content by statusBarHeight.
  // CustomToolbar would add the same inset again → double chin + back.
  ...(Platform.OS === "android"
    ? {
        unstable_nativeProps: {
          headerConfig: { disableTopInsetApplication: true },
        },
      }
    : null),
} as const;

export const tabChrome = {
  ...headerChrome,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
  },
  sceneStyle: { backgroundColor: colors.bg },
} as const;

export const stackChrome = {
  ...headerChrome,
  headerBackTitleVisible: false,
  headerTitleAlign: "left" as const,
  headerStyle: {
    backgroundColor: colors.surface,
    ...(Platform.OS === "android" ? { elevation: 0 } : null),
  },
  headerTitleContainerStyle: {
    paddingVertical: 0,
    marginHorizontal: 0,
  },
  headerLeftContainerStyle: { paddingVertical: 0 },
  headerRightContainerStyle: { paddingVertical: 0 },
  contentStyle: { backgroundColor: colors.bg },
} as const;
