import { router } from "expo-router";
import { BookOpen, ChevronRight, Inbox, MessageCircle, Search } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HubHeader } from "@/components/hub/hub-header";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import {
  latestInboxThread,
  listUnassignedConversations,
} from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { knowledgeListHref } from "@/lib/hub-routes";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";

export function AgentHub() {
  const insets = useSafeAreaInsets();
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const unassignedCount = listUnassignedConversations(CONVERSATIONS).length;
  const bottomPad = screenBottomPad(insets.bottom, 24);

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
        <HubHeader title="Agent" settingsHref="/(agent)/settings" />

        <Text className="mt-6 font-sans text-base font-normal text-ink-soft">
          Hi {firstName(me.displayName)}
        </Text>
        <Text className="mt-1 font-sans text-2xl font-bold text-ink">Your queue</Text>

        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(40)}
          className="mt-5 flex-row gap-3"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.navigate("/(agent)/conversations")}
            className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
          >
            <MessageCircle color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">Messages</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("agent"))}
            className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
          >
            <BookOpen color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">
              Knowledge base
            </Text>
          </Pressable>
        </Animated.View>

        {recent ? <RecentThreadCard conversation={recent} selfId={me.id} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search knowledge"
          onPress={() => router.push("/(agent)/search")}
          className="mt-4 min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/10"
        >
          <Search color={colors.muted} size={20} />
          <Text className="font-sans text-base font-normal text-muted">Search knowledge</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unassigned pool"
          onPress={() => router.navigate("/(agent)/unassigned")}
          className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
        >
          <Inbox color={colors.primary} size={22} />
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-base font-medium text-ink">Unassigned pool</Text>
            <Text className="mt-0.5 font-sans text-sm font-normal text-muted">
              {unassignedCount} waiting
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
      </View>

      <View className="px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(agent)/faq")}
          className="mt-6 min-h-11 flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
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
