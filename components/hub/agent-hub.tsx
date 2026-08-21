import { router, type Href } from "expo-router";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

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
import { PresenceDot } from "@/components/ui/presence-dot";
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
import { settleDownEnter } from "@/lib/motion-enter";
import { getSession } from "@/lib/session";
import { colors } from "@/lib/tokens";

export function AgentHub() {
  const me = getDevUser();
  const reduceMotion = useReducedMotion();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const unassignedCount = listUnassignedConversations(CONVERSATIONS).length;
  const assignedCount = CONVERSATIONS.filter((c) => c.assigneeId === me.id).length;

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={"/(agent)/settings" as Href} />

        <Animated.View entering={settleDownEnter(!!reduceMotion)}>
          <Text variant="label" className="mt-5 uppercase tracking-wider text-muted">
            {hubEyebrow(me.role)}
          </Text>
          <Text variant="display" className="mt-0.5 text-ink">
            {hubGreeting(me.role, firstName(me.displayName))}
          </Text>
        </Animated.View>

        {/* Live Queue Overview Card */}
        <Animated.View
          entering={settleDownEnter(!!reduceMotion, 20)}
          className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
            <View className="flex-row items-center gap-2">
              <PresenceDot breathe className="size-2" />
              <Text variant="label" className="uppercase tracking-wider text-ink-soft">
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
              alert={unassignedCount > 0}
              accessibilityLabel="Unassigned tickets"
              onPress={() => router.navigate("/(agent)/unassigned" as Href)}
            />
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          entering={settleDownEnter(!!reduceMotion, 60)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="Active chats"
            tone="neutral"
            onPress={() => router.navigate("/(agent)/conversations" as Href)}
          />
          <ActionTile
            icon={BookOpen}
            title="Knowledge"
            hint="Guides & answers"
            tone="neutral"
            accessibilityLabel="Knowledge base"
            onPress={() => router.push(knowledgeListHref("agent"))}
          />
        </Animated.View>

        {recent ? (
          <View className="mt-4">
            <Text variant="label" className="mb-2 uppercase tracking-wider text-muted">
              Recent Conversation
            </Text>
            <RecentThreadCard conversation={recent} selfId={me.id} />
          </View>
        ) : null}

        {/* Search Knowledge Trigger */}
        <Animated.View entering={settleDownEnter(!!reduceMotion, 100)}>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Search knowledge"
            onPress={() => router.push("/(agent)/search" as Href)}
            className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/5"
          >
            <IconChip icon={Search} tone="neutral" size={32} />
            <Text variant="meta" className="flex-1 text-muted">
              Search knowledge articles…
            </Text>
            <Sparkles color={colors.muted} size={16} />
          </TactilePressable>
        </Animated.View>

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
          tone="neutral"
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
