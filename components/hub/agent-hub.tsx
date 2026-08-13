import { router, type Href } from "expo-router";
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Inbox,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HubHeader } from "@/components/hub/hub-header";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
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
  const unassigned = listUnassignedConversations(CONVERSATIONS);
  const unassignedCount = unassigned.length;
  const assignedCount = CONVERSATIONS.filter((c) => c.assigneeId === me.id).length;
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
        <HubHeader title="Agent" settingsHref={"/(agent)/settings" as Href} />

        <View className="mt-5">
          <Text className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
            Agent Dashboard
          </Text>
          <Text className="mt-0.5 font-sans text-2xl font-bold text-ink">
            Hi, {firstName(me.displayName)} 👋
          </Text>
        </View>

        {/* Live Queue Overview Card */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(20)}
          className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
            <View className="flex-row items-center gap-2">
              <View className="size-2 rounded-full bg-success" />
              <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Live Queue Status
              </Text>
            </View>
            <View className="rounded-full bg-primary-soft px-2.5 py-0.5">
              <Text className="font-sans text-xs font-semibold text-primary">
                Online
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Assigned to you"
              onPress={() => router.navigate("/(agent)/conversations" as Href)}
              className="flex-1 rounded-2xl bg-bg/80 p-3"
            >
              <Text className="font-sans text-2xl font-extrabold text-ink">
                {assignedCount}
              </Text>
              <Text className="mt-0.5 font-sans text-xs font-medium text-muted">
                Assigned to you
              </Text>
            </TactilePressable>

            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Unassigned tickets"
              onPress={() => router.navigate("/(agent)/unassigned" as Href)}
              className="flex-1 rounded-2xl bg-bg/80 p-3"
            >
              <View className="flex-row items-center gap-1.5">
                <Text className="font-sans text-2xl font-extrabold text-primary">
                  {unassignedCount}
                </Text>
                {unassignedCount > 0 ? (
                  <View className="size-2 rounded-full bg-amber" />
                ) : null}
              </View>
              <Text className="mt-0.5 font-sans text-xs font-medium text-muted">
                Unassigned pool
              </Text>
            </TactilePressable>
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(60)}
          className="mt-4 flex-row gap-3"
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.navigate("/(agent)/conversations" as Href)}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <MessageCircle color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Messages
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Active chats
            </Text>
          </TactilePressable>

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("agent"))}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <BookOpen color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Knowledge
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Guides & answers
            </Text>
          </TactilePressable>
        </Animated.View>

        {recent ? (
          <View className="mt-4">
            <Text className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Recent Conversation
            </Text>
            <RecentThreadCard conversation={recent} selfId={me.id} />
          </View>
        ) : null}

        {/* Search Knowledge Trigger */}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Search knowledge"
          onPress={() => router.push("/(agent)/search" as Href)}
          className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/5"
        >
          <View className="size-8 items-center justify-center rounded-xl bg-bg">
            <Search color={colors.muted} size={18} />
          </View>
          <Text className="flex-1 font-sans text-sm font-normal text-muted">
            Search knowledge articles…
          </Text>
          <Sparkles color={colors.primary} size={16} />
        </TactilePressable>

        {/* Unassigned Pool Row Card */}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Unassigned pool"
          onPress={() => router.navigate("/(agent)/unassigned" as Href)}
          className="mt-4 flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="size-11 items-center justify-center rounded-2xl bg-amber/15">
            <Inbox color={colors.amber} size={22} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-base font-semibold text-ink">
              Unassigned Pool
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              {unassignedCount} {unassignedCount === 1 ? "ticket" : "tickets"} waiting for pickup
            </Text>
          </View>
          {unassignedCount > 0 ? (
            <View className="rounded-full bg-amber/20 px-2.5 py-1">
              <Text className="font-sans text-xs font-bold text-amber">
                {unassignedCount} new
              </Text>
            </View>
          ) : null}
          <ChevronRight color={colors.muted} size={18} />
        </TactilePressable>
      </View>

      {/* FAQ Row */}
      <View className="mt-4 px-4">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(agent)/faq" as Href)}
          className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
            <Headphones color={colors.primary} size={22} />
          </View>
          <View className="min-w-0 flex-1 pl-3 pr-2">
            <Text className="font-sans text-base font-semibold text-ink">
              Frequently Asked Questions
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted" numberOfLines={1}>
              Quick references for common customer issues
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </TactilePressable>
      </View>
    </ScrollView>
  );
}
