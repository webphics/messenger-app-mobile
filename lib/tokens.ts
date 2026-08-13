import { Platform } from 'react-native'

/** Hex copies of `global.css` @theme. Native headers/tabs cannot use className. */
export const colors = {
  bg: '#F5F6F9',
  surface: '#FFFFFF',
  ink: '#14161F',
  inkSoft: '#3A3D4A',
  muted: '#6B7280',
  line: '#E4E6EC',
  primary: '#3452D9',
  primaryForeground: '#FFFFFF',
  success: '#1F9D6C',
  danger: '#D64545',
  amber: '#E2831C',
} as const

const headerChrome = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerTitleStyle: { color: colors.ink, fontWeight: '600' as const },
  headerShadowVisible: false,
} as const

/** Android edge-to-edge: native-stack ignores `headerStatusBarHeight` (JS stack only). */
const androidStackChrome =
  Platform.OS === 'android'
    ? {
        headerStatusBarHeight: 0,
        unstable_nativeProps: {
          headerConfig: {
            disableTopInsetApplication: true,
          },
        },
      }
    : null

export const tabChrome = {
  ...headerChrome,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
  },
  sceneStyle: { backgroundColor: colors.bg },
} as const

export const stackChrome = {
  ...headerChrome,
  headerBackTitleVisible: false,
  headerTitleAlign: 'left' as const,
  ...androidStackChrome,
  headerStyle: {
    backgroundColor: colors.surface,
    ...(Platform.OS === 'android' ? { height: 48, elevation: 0 } : null),
  },
  headerTitleContainerStyle: {
    paddingVertical: 0,
    marginHorizontal: 0,
    ...(Platform.OS === 'android' ? { height: 48 } : null),
  },
  headerLeftContainerStyle: { paddingVertical: 0 },
  headerRightContainerStyle: { paddingVertical: 0 },
  contentStyle: { backgroundColor: colors.bg },
} as const
