import { router, type Href } from "expo-router";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

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
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { latestInboxThread } from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { knowledgeListHref } from "@/lib/hub-routes";
import { CONVERSATIONS, PEOPLE } from "@/lib/mock-data";
import { settleDownEnter } from "@/lib/motion-enter";
import { getSession } from "@/lib/session";
import { colors } from "@/lib/tokens";

export function AdminHub() {
  const me = getDevUser();
  const reduceMotion = useReducedMotion();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;
  const totalUsers = PEOPLE.length;

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={"/(admin)/settings" as Href} />

        <Animated.View entering={settleDownEnter(!!reduceMotion)}>
          <Text variant="label" className="mt-5 uppercase tracking-wider text-muted">
            {hubEyebrow(me.role)}
          </Text>
          <Text variant="display" className="mt-0.5 text-ink">
            {hubGreeting(me.role, firstName(me.displayName))}
          </Text>
        </Animated.View>

        {/* System Health / Overview Stats */}
        <Animated.View
          entering={settleDownEnter(!!reduceMotion, 20)}
          className="mt-4 overflow-hidden rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
        >
          <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
            <View className="flex-row items-center gap-2">
              <ShieldCheck color={colors.muted} size={18} />
              <Text variant="label" className="uppercase tracking-wider text-ink-soft">
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
              accessibilityLabel="Conversations"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
            />
          </View>
        </Animated.View>

        {/* Admin Navigation Quick Grid */}
        <Animated.View
          entering={settleDownEnter(!!reduceMotion, 60)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="All threads"
            tone="neutral"
            onPress={() => router.navigate("/(admin)/conversations" as Href)}
          />
          <ActionTile
            icon={BookOpen}
            title="Knowledge"
            hint="Manage articles"
            tone="neutral"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("admin"))}
          />
        </Animated.View>

        {recent ? (
          <View className="mt-4">
            <Text variant="label" className="mb-2 uppercase tracking-wider text-muted">
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
          tone="primary"
          title="Create New Offer"
          hint="Publish a promotional campaign banner"
          accessibilityLabel="Add offer"
          onPress={() => router.push("/(admin)/offer-add" as Href)}
        />
      </View>
    </HubScroll>
  );
}
