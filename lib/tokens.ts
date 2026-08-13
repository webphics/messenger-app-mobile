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
  contentStyle: { backgroundColor: colors.bg },
} as const
