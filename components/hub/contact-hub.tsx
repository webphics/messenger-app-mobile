import { router } from "expo-router";
import {
    ChevronRight,
    HelpCircle,
    MessageCircle,
    Search,
    Settings,
} from "lucide-react-native";
import { Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OffersCarousel } from "@/components/hub/offers-carousel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { firstName, formatRelativeTime, initials } from "@/lib/display";
import { CONVERSATIONS, getDevUser, PEOPLE } from "@/lib/mock-data";
import { colors, screenTopPad } from "@/lib/tokens";

function assignedAgents() {
  return PEOPLE.filter((p) => p.role === "agent");
}

function latestOwnThread(userId: string) {
  return CONVERSATIONS.filter(
    (c) => c.id !== "offers" && c.participantIds.includes(userId),
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export function ContactHub() {
  const insets = useSafeAreaInsets();
  const me = getDevUser();
  const agents = assignedAgents();
  const recent = latestOwnThread(me.id);
  const otherId = recent?.participantIds.find((id) => id !== me.id);
  const other = PEOPLE.find((p) => p.id === otherId);
  const bottomPad = Platform.OS === "ios" ? insets.bottom + 24 : 24;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: screenTopPad(insets.top),
        paddingBottom: bottomPad,
      }}
    >
      <View className="px-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans text-2xl font-bold uppercase tracking-wide text-ink">
            Support
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-row">
              {agents.map((agent, i) => (
                <Avatar
                  key={agent.id}
                  className="size-9 border-2 border-bg"
                  style={{ marginLeft: i === 0 ? 0 : -10 }}
                >
                  <AvatarFallback className="bg-primary-soft">
                    <Text className="font-sans text-xs font-semibold text-primary">
                      {initials(agent.displayName)}
                    </Text>
                  </AvatarFallback>
                </Avatar>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/(contact)/settings")}
              className="size-11 items-center justify-center"
            >
              <Settings color={colors.ink} size={22} />
            </Pressable>
          </View>
        </View>

        <Text className="mt-6 font-sans text-base font-normal text-ink-soft">
          Hi {firstName(me.displayName)}
        </Text>
        <Text className="mt-1 font-sans text-2xl font-bold text-ink">
          How can we help?
        </Text>

        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(40)}
          className="mt-5 flex-row gap-3"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.push("/(contact)/messages")}
            className="min-h-24 flex-1 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
          >
            <MessageCircle color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">
              Messages
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Help"
            onPress={() => router.push("/(contact)/help")}
            className="min-h-24 flex-1 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
          >
            <HelpCircle color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">
              Help
            </Text>
          </Pressable>
        </Animated.View>

        {recent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open recent message"
            onPress={() => router.push(chatHref(recent.id))}
            className="mt-4 flex-row items-center gap-3 rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
          >
            <Avatar className="size-11">
              <AvatarFallback className="bg-primary-soft">
                <Text className="font-sans text-sm font-semibold text-primary">
                  {initials(other?.displayName ?? recent.subject ?? "S")}
                </Text>
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <Text
                className="font-sans text-base font-medium text-ink"
                numberOfLines={1}
              >
                {other?.displayName ?? recent.subject ?? "Support"}
              </Text>
              <Text
                className="mt-0.5 font-sans text-sm font-normal text-muted"
                numberOfLines={1}
              >
                {recent.lastMessagePreview} ·{" "}
                {formatRelativeTime(recent.updatedAt)}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search for help"
          onPress={() => router.push("/(contact)/search")}
          className="mt-4 min-h-11 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-md shadow-black/10"
        >
          <Search color={colors.muted} size={20} />
          <Text className="font-sans text-base font-normal text-muted">
            Search for help
          </Text>
        </Pressable>
      </View>

      <OffersCarousel />

      <View className="px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(contact)/faq")}
          className="mt-6 min-h-11 flex-row items-center justify-between rounded-2xl bg-surface p-4 shadow-md shadow-black/10"
        >
          <View className="min-w-0 flex-1 pr-2">
            <Text className="font-sans text-base font-medium text-ink">
              Frequently Asked Questions
            </Text>
            <Text className="mt-1 font-sans text-sm font-normal text-muted">
              Common questions — passwords, billing, access…
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
      </View>
    </ScrollView>
  );
}
