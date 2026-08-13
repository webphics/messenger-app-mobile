import { router } from "expo-router";
import { View } from "react-native";

import { RoleSwitch } from "@/components/settings/role-switch";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { signOutSession } from "@/lib/session";

export function SettingsScreen() {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <View className="rounded-2xl border border-line bg-surface p-4">
        <RoleSwitch />
        <Button
          className="mt-8"
          variant="outline"
          onPress={() => {
            void signOutSession().then(() => {
              router.replace("/(auth)/sign-in");
            });
          }}
        >
          <Text>Sign out</Text>
        </Button>
      </View>
    </View>
  );
}
