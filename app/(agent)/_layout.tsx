import { Tabs } from "expo-router";
import { House, Inbox, MessageCircle } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { useTabChrome } from "@/lib/use-tab-chrome";

export default function AgentLayout() {
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
