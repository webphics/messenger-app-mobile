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
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

SplashScreen.preventAutoHideAsync()

const SPLASH_FALLBACK_MS = 2500

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope: Manrope_400Regular,
    'Manrope-Medium': Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'JetBrains Mono': JetBrainsMono_500Medium,
    'JetBrains Mono-Bold': JetBrainsMono_700Bold,
  })

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync()
    }
  }, [loaded, error])

  useEffect(() => {
    // ponytail: Google Fonts on Expo Go can stay pending forever (loaded=false, error=null).
    // Ceiling: hide splash after 2.5s. Upgrade: drop the gate and use expo-font config plugin with bundled TTFs.
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync()
    }, SPLASH_FALLBACK_MS)
    return () => clearTimeout(timeout)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  )
}
