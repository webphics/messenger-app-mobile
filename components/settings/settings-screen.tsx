import { router } from "expo-router";
import { LogOut, Shield } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { RoleSwitch } from "@/components/settings/role-switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { getDevUser } from "@/lib/dev-user";
import { initials } from "@/lib/display";
import { getSession, signOutSession } from "@/lib/session";
import { colors } from "@/lib/tokens";

export function SettingsScreen() {
  const me = getDevUser();
  const session = getSession();

  return (
    <ScrollView
      className="flex-1 bg-bg px-4 pt-4"
      showsVerticalScrollIndicator={false}
    >
      {/* Current User Card */}
      <View className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
        <Avatar alt={me.displayName} className="size-14">
          <AvatarFallback className="bg-primary-soft">
            <Text className="font-sans text-lg font-bold text-primary">
              {initials(me.displayName)}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1">
          <Text className="font-sans text-lg font-bold text-ink" numberOfLines={1}>
            {me.displayName}
          </Text>
          <Text className="font-sans text-xs font-normal text-muted" numberOfLines={1}>
            {session.email || "support@company.internal"}
          </Text>
          <View className="mt-1.5 self-start rounded-full bg-primary-soft px-2.5 py-0.5">
            <Text className="font-sans text-[10px] font-bold uppercase tracking-wider text-primary">
              Active: {session.role}
            </Text>
          </View>
        </View>
      </View>

      {/* Role Switcher */}
      <View className="mt-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
        <RoleSwitch />
      </View>

      {/* App Info & Sign Out */}
      <View className="my-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
        <View className="mb-4 flex-row items-center justify-between border-b border-line/60 pb-3">
          <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
            Application
          </Text>
          <Text className="font-sans text-xs font-medium text-ink-soft">
            Messenger v1.0.0
          </Text>
        </View>

        <Button
          variant="outline"
          className="min-h-12 border-danger/30 active:bg-danger/10"
          onPress={() => {
            void signOutSession().then(() => {
              router.replace("/(auth)/sign-in");
            });
          }}
        >
          <LogOut color={colors.danger} size={18} />
          <Text className="text-danger">Sign out</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
