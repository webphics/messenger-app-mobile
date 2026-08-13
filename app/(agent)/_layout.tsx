import { Inbox, MessageCircle, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

export default function AgentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3452d9',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Assigned',
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
