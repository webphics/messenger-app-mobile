import { Inbox, MessageCircle, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

import { tabChrome } from '@/lib/tokens'

export default function AgentLayout() {
  return (
    <Tabs screenOptions={tabChrome}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Messages',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="unassigned"
        options={{
          title: 'Unassigned',
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
