import { router } from "expo-router";
import {
  ChevronRight,
  HelpCircle,
  MessageCircle,
  Search,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";

export function HelpHome() {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
    >
      <Text className="font-sans text-base font-normal text-ink-soft">
        Agents are online 08:00–20:00 weekdays. Offers chat is always open.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Message Support"
        onPress={() => router.push("/(contact)/messages")}
        className="mt-4 min-h-11 flex-row items-center gap-3 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
      >
        <MessageCircle color={colors.primary} size={22} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-medium text-ink">
            Message Support
          </Text>
          <Text className="mt-0.5 font-sans text-sm font-normal text-muted">
            Open your conversations
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search for help"
        onPress={() => router.push("/(contact)/search")}
        className="mt-3 min-h-11 flex-row items-center gap-3 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
      >
        <Search color={colors.primary} size={22} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-medium text-ink">
            Search for help
          </Text>
          <Text className="mt-0.5 font-sans text-sm font-normal text-muted">
            Find answers quickly
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Frequently asked questions"
        onPress={() => router.push("/(contact)/faq")}
        className="mt-3 min-h-11 flex-row items-center gap-3 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
      >
        <HelpCircle color={colors.primary} size={22} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-medium text-ink">
            Frequently Asked Questions
          </Text>
          <Text className="mt-0.5 font-sans text-sm font-normal text-muted">
            Passwords, billing, access…
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
    </ScrollView>
  );
}
