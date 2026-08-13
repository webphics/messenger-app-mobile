import { House, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

import { tabChrome } from '@/lib/tokens'

export default function ContactLayout() {
  return (
    <Tabs screenOptions={tabChrome}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="messages" options={{ href: null, title: 'Messages' }} />
      <Tabs.Screen name="help" options={{ href: null, title: 'Help' }} />
    </Tabs>
  )
}
