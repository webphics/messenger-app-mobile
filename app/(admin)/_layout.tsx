import { Tabs } from "expo-router";
import { House, Inbox, MessageCircle, Users } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { useTabChrome } from "@/lib/use-tab-chrome";

export default function AdminLayout() {
  const chrome = useTabChrome();

  return (
    <Tabs
      screenOptions={chrome}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="unassigned"
        options={{
          title: "Unassigned",
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Messages",
          tabBarLabel: "Conversations",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
