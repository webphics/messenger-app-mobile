import { router, type Href } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import {
  BookOpen,
  Headphones,
  Inbox,
  MessageCircle,
  Search,
  Sparkles,
} from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { ActionTile, StatTile } from "@/components/hub/action-tile";
import { HubHeader } from "@/components/hub/hub-header";
import { HubScroll } from "@/components/hub/hub-scroll";
import { IconChip } from "@/components/hub/icon-chip";
import { Pill } from "@/components/hub/pill";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import {
  latestInboxThread,
  listUnassignedConversations,
} from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { knowledgeListHref } from "@/lib/hub-routes";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { colors } from "@/lib/tokens";

export function AgentHub() {
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const unassignedCount = listUnassignedConversations(CONVERSATIONS).length;
  const assignedCount = CONVERSATIONS.filter((c) => c.assigneeId === me.id).length;

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={"/(agent)/settings" as Href} />

        <View className="mt-5">
          <Text className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
            {hubEyebrow(me.role)}
          </Text>
          <Text className="mt-0.5 font-sans text-2xl font-bold text-ink">
            {hubGreeting(me.role, firstName(me.displayName))}
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
            <Pill label="Online" />
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <StatTile
              value={String(assignedCount)}
              label="Assigned to you"
              onPress={() => router.navigate("/(agent)/conversations" as Href)}
            />
            <StatTile
              value={String(unassignedCount)}
              label="Unassigned pool"
              tone="primary"
              alert={unassignedCount > 0}
              accessibilityLabel="Unassigned tickets"
              onPress={() => router.navigate("/(agent)/unassigned" as Href)}
            />
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(60)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="Active chats"
            onPress={() => router.navigate("/(agent)/conversations" as Href)}
          />
          <ActionTile
            icon={BookOpen}
            title="Knowledge"
            hint="Guides & answers"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("agent"))}
          />
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
          <IconChip icon={Search} tone="neutral" size={32} />
          <Text className="flex-1 font-sans text-sm font-normal text-muted">
            Search knowledge articles…
          </Text>
          <Sparkles color={colors.primary} size={16} />
        </TactilePressable>

        {/* Unassigned Pool Row Card */}
        <ActionRow
          className="mt-4"
          icon={Inbox}
          tone="amber"
          title="Unassigned Pool"
          hint={`${unassignedCount} ${unassignedCount === 1 ? "ticket" : "tickets"} waiting for pickup`}
          accessibilityLabel="Unassigned pool"
          onPress={() => router.navigate("/(agent)/unassigned" as Href)}
          trailing={
            unassignedCount > 0 ? (
              <Pill label={`${unassignedCount} new`} tone="amber" />
            ) : null
          }
        />
      </View>

      {/* FAQ Row */}
      <View className="mt-4 px-4">
        <ActionRow
          icon={Headphones}
          title="Frequently Asked Questions"
          hint="Quick references for common customer issues"
          hintLines={1}
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(agent)/faq" as Href)}
        />
      </View>
    </HubScroll>
  );
}
