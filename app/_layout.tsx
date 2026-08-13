import '../global.css'
import 'react-native-gesture-handler'

import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Uniwind } from 'uniwind'

import { colors, stackChrome } from '@/lib/tokens'

Uniwind.setTheme('light')

export default function RootLayout() {
  useFonts({
    Manrope: Manrope_400Regular,
    'Manrope-Medium': Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'JetBrains Mono': JetBrainsMono_500Medium,
    'JetBrains Mono-Bold': JetBrainsMono_700Bold,
  })

  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" backgroundColor={colors.surface} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="chat/[id]"
          options={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
        <Stack.Screen name="(auth)" options={{ ...stackChrome, title: 'Sign in' }} />
      </Stack>
    </GestureHandlerRootView>
  )
}
