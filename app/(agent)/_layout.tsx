import { Tabs } from "expo-router";
import { House, Inbox, MessageCircle } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { tabChrome } from "@/lib/tokens";

export default function AgentLayout() {
  return (
    <Tabs
      screenOptions={tabChrome}
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
