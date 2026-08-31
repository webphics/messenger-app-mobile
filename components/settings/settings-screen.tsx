import { router } from "expo-router";
import { LogOut, Trash2 } from "@/components/icons";
import { Alert, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { getDevUser } from "@/lib/dev-user";
import { initials } from "@/lib/display";
import { hubEyebrow } from "@/lib/hub-chrome";
import { settleDownEnter } from "@/lib/motion-enter";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";

export function SettingsScreen() {
  const me = getDevUser();
  const { state, signOut } = useAuth();
  // The signed-in person, read from the provider rather than the module mirror so
  // this card re-renders the moment they sign out instead of showing their name
  // and email until the navigation lands.
  const account = state.status === "signed-in" ? state.user : null;
  // Falls back to the mock person only when there is no signed-in name to show,
  // so this card never pairs a fixture's name with a real email address.
  const displayName = account?.name ?? me.displayName;
  const reduceMotion = useReducedMotion();
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {});

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? All messages, active queue assignments, and stored profile data will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            void signOut();
            router.replace("/(auth)/sign-in");
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg px-4 pt-4"
      showsVerticalScrollIndicator={false}
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <Animated.View
        entering={settleDownEnter(!!reduceMotion)}
        className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <Avatar alt={displayName} className="size-14">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="headline" className="text-primary">
              {initials(displayName)}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1">
          <Text variant="headline" className="text-ink" numberOfLines={1}>
            {displayName}
          </Text>
          <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
            {account?.email ?? ""}
          </Text>
          <View className="mt-1.5 self-start rounded-full bg-primary-soft px-2.5 py-0.5">
            <Text variant="label" className="font-bold uppercase tracking-wider text-primary">
              {hubEyebrow(account?.role ?? "customer")}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        entering={settleDownEnter(!!reduceMotion, 80)}
        className="my-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <View className="mb-4 flex-row items-center justify-between border-b border-line/60 pb-3">
          <Text variant="label" className="uppercase tracking-wider text-muted">
            Application
          </Text>
          <Text variant="label" className="font-medium text-ink-soft">
            Enki v1.0.0
          </Text>
        </View>

        <Button
          variant="outline"
          className="min-h-12 border-danger/30 active:bg-danger/10"
          onPress={() => {
            void signOut();
            router.replace("/(auth)/sign-in");
          }}
        >
          <LogOut color={colors.danger} size={18} />
          <Text className="text-danger">Sign out</Text>
        </Button>

        <Button
          variant="ghost"
          className="mt-2.5 min-h-11"
          onPress={handleDeleteAccount}
        >
          <Trash2 color={colors.danger} size={16} />
          <Text className="text-danger">Delete Account</Text>
        </Button>
      </Animated.View>
    </ScrollView>
  );
}
