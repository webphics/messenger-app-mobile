import { Tabs } from "expo-router";
import { House, Inbox, MessageCircle, Newspaper, Users } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { canAccessUnassignedPool } from "@/lib/rbac";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { useTabChrome } from "@/lib/use-tab-chrome";

export default function AdminLayout() {
  const chrome = useTabChrome();
  const supportAssignment = useSupportAssignment();

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
        name="contacts"
        options={{
          title: "People",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      {/*
        Gone, rather than drawn empty, in a Shared queue: there is no pool. A
        guard rather than `href: null` because the tab capsule draws every route
        the navigator holds, and a guarded one is not held at all.
      */}
      <Tabs.Protected guard={canAccessUnassignedPool("admin", supportAssignment)}>
        <Tabs.Screen
          name="unassigned"
          options={{
            title: "Unassigned",
            tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
          }}
        />
      </Tabs.Protected>
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
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
