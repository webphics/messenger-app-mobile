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
  // Floating capsule owns chrome; keep the host bar invisible.
  tabBarStyle: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
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

/** 5-tier elevation and depth token presets */
export const shadows = {
  /** Level -1: Sunken/carved well (inputs, search bars, composer text area, metric wells) */
  divit: "border border-line/80 bg-line/35",
  /** Level 1: Raised card pop-out (conversation rows, hub action cards, FAQ/knowledge rows) */
  card: "shadow-md shadow-black/8 border border-line/70 bg-surface",
  /** Level 2: Primary button resting lift */
  buttonPrimary: "shadow-sm shadow-primary/25",
  /** Level 2: Secondary/Outline button resting lift */
  buttonSecondary: "shadow-xs shadow-black/8",
  /** Level 3: Floating tab bar capsule */
  floating: "shadow-xl shadow-black/15 border border-line/80 bg-surface/95",
  /** Level 3: Overlay sheets, reaction trays, and modal dialogs */
  overlay: "shadow-2xl shadow-black/20 border border-line bg-surface",
} as const;

