import { router, type Href } from "expo-router";
import {
  BookOpen,
  ChevronRight,
  MessageCircle,
  Plus,
  ShieldCheck,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChartsSection } from "@/components/hub/charts-section";
import { HubHeader } from "@/components/hub/hub-header";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import { latestInboxThread } from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { knowledgeListHref } from "@/lib/hub-routes";
import { CONVERSATIONS, PEOPLE } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";

export function AdminHub() {
  const insets = useSafeAreaInsets();
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const bottomPad = screenBottomPad(insets.bottom, 24);
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;
  const totalUsers = PEOPLE.length;

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
        <HubHeader title="Admin" settingsHref={"/(admin)/settings" as Href} />

        <View className="mt-5">
          <Text className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
            Executive Overview
          </Text>
          <Text className="mt-0.5 font-sans text-2xl font-bold text-ink">
            Hi, {firstName(me.displayName)} 👋
          </Text>
        </View>

        {/* System Health / Overview Stats */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(20)}
          className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
            <View className="flex-row items-center gap-2">
              <ShieldCheck color={colors.primary} size={18} />
              <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">
                System Oversight
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5">
              <View className="size-2 rounded-full bg-success" />
              <Text className="font-sans text-xs font-semibold text-success">
                Operational
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="User directory"
              onPress={() => router.navigate("/(admin)/users" as Href)}
              className="flex-1 rounded-2xl bg-bg/80 p-3"
            >
              <Text className="font-sans text-2xl font-extrabold text-ink">
                {onlineCount}
                <Text className="font-sans text-sm font-medium text-muted">
                  /{totalUsers}
                </Text>
              </Text>
              <Text className="mt-0.5 font-sans text-xs font-medium text-muted">
                Active users
              </Text>
            </TactilePressable>

            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Conversations"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
              className="flex-1 rounded-2xl bg-bg/80 p-3"
            >
              <Text className="font-sans text-2xl font-extrabold text-primary">
                {CONVERSATIONS.length}
              </Text>
              <Text className="mt-0.5 font-sans text-xs font-medium text-muted">
                Conversations
              </Text>
            </TactilePressable>
          </View>
        </Animated.View>

        {/* Admin Navigation Quick Grid */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(60)}
          className="mt-4 flex-row gap-3"
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.navigate("/(admin)/conversations" as Href)}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <MessageCircle color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Messages
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              All threads
            </Text>
          </TactilePressable>

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("admin"))}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <BookOpen color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Knowledge
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Manage articles
            </Text>
          </TactilePressable>
        </Animated.View>

        {recent ? (
          <View className="mt-4">
            <Text className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Recent Message
            </Text>
            <RecentThreadCard conversation={recent} selfId={me.id} />
          </View>
        ) : null}
      </View>

      {/* Analytics & Charts Carousel */}
      <ChartsSection />

      {/* Admin Actions */}
      <View className="mt-4 px-4">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Add offer"
          onPress={() => router.push("/(admin)/offer-add" as Href)}
          className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-3.5 pr-2">
            <View className="size-11 items-center justify-center rounded-2xl bg-primary">
              <Plus color={colors.primaryForeground} size={22} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-sans text-base font-semibold text-ink">
                Create New Offer
              </Text>
              <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
                Publish a promotional campaign banner
              </Text>
            </View>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </TactilePressable>
      </View>
    </ScrollView>
  );
}
