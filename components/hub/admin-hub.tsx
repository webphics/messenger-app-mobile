import { router, type Href } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { BookOpen, MessageCircle, Plus, ShieldCheck } from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { ActionTile, StatTile } from "@/components/hub/action-tile";
import { ChartsSection } from "@/components/hub/charts-section";
import { HubHeader } from "@/components/hub/hub-header";
import { HubScroll } from "@/components/hub/hub-scroll";
import { Pill } from "@/components/hub/pill";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import { latestInboxThread } from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { knowledgeListHref } from "@/lib/hub-routes";
import { CONVERSATIONS, PEOPLE } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { colors } from "@/lib/tokens";

export function AdminHub() {
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;
  const totalUsers = PEOPLE.length;

  return (
    <HubScroll>
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
            <Pill label="Operational" tone="success" dot />
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <StatTile
              value={String(onlineCount)}
              suffix={`/${totalUsers}`}
              label="Active users"
              accessibilityLabel="User directory"
              onPress={() => router.navigate("/(admin)/users" as Href)}
            />
            <StatTile
              value={String(CONVERSATIONS.length)}
              label="Conversations"
              tone="primary"
              accessibilityLabel="Conversations"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
            />
          </View>
        </Animated.View>

        {/* Admin Navigation Quick Grid */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(60)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="All threads"
            onPress={() => router.navigate("/(admin)/conversations" as Href)}
          />
          <ActionTile
            icon={BookOpen}
            title="Knowledge"
            hint="Manage articles"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("admin"))}
          />
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
        <ActionRow
          icon={Plus}
          tone="primaryFilled"
          title="Create New Offer"
          hint="Publish a promotional campaign banner"
          accessibilityLabel="Add offer"
          onPress={() => router.push("/(admin)/offer-add" as Href)}
        />
      </View>
    </HubScroll>
  );
}
