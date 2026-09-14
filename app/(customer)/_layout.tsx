import { Tabs } from "expo-router";
import { HelpCircle, House, MessageCircle, Newspaper } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { useTabChrome } from "@/lib/use-tab-chrome";

export default function CustomerLayout() {
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
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: "Help",
          tabBarIcon: ({ color, size }) => (
            <HelpCircle color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="wall"
        options={{
          title: "Wall",
          tabBarIcon: ({ color, size }) => (
            <Newspaper color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
