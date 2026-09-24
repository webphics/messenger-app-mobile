import { router, type Href } from "expo-router";
import { View } from "react-native";

import {
  // BookOpen, // hidden with Knowledge
  // Headphones, // hidden with FAQ
  Inbox,
  MessageCircle,
  // Search, // hidden with Knowledge search
  // Sparkles, // hidden with Knowledge search
} from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { StatTile } from "@/components/hub/action-tile"; // ActionTile hidden with the Knowledge pair
import { HubHeader } from "@/components/hub/hub-header";
import { HubScroll } from "@/components/hub/hub-scroll";
// import { IconChip } from "@/components/hub/icon-chip"; // hidden with Knowledge search
import { Pill } from "@/components/hub/pill";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { PresenceDot } from "@/components/ui/presence-dot";
// import { TactilePressable } from "@/components/ui/tactile-pressable"; // hidden with Knowledge search
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { useConversationInbox } from "@/lib/conversation-inbox";
import {
  latestInboxThread,
  listAssignedConversations,
  listUnassignedConversations,
} from "@/lib/inbox-filter";
// import { knowledgeListHref } from "@/lib/hub-routes"; // hidden with Knowledge
import { getSessionUser } from "@/lib/session";
import { useSupportAssignment } from "@/lib/use-support-assignment";
// import { colors } from "@/lib/tokens"; // hidden with Knowledge search

/** Stands in for a count the list has not answered with yet. An em dash, not a zero. */
const PENDING_COUNT = "—";

export function AgentHub() {
  const me = getSessionUser();
  const inbox = useConversationInbox();
  /*
   * The list this hub counts, once there is one.
   *
   * A hub is not where a fetch failure is explained — Messages is — so a load
   * that has not answered shows no number rather than a zero it would have to
   * take back: an empty queue and an unfetched one are not the same news to an
   * Agent, and a `0` that turns into `4` a moment later reads as the first one
   * having been a lie.
   */
  const counted = inbox.status === "ready" && me ? inbox.conversations : null;
  const recent = counted && me ? latestInboxThread(counted) : undefined;
  const unassignedCount = counted ? listUnassignedConversations(counted).length : null;
  const assignedCount = counted && me ? listAssignedConversations(me.id, counted).length : null;
  /*
   * Both halves of the queue card and the pool row are about assignment, so a
   * Shared queue draws none of them: there is no pool, and nothing is assigned
   * to anybody.
   */
  const supportAssignment = useSupportAssignment();

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={"/(agent)/settings" as Href} />

        <View>
          <Text variant="label" className="mt-5 uppercase tracking-wider text-muted">
            {hubEyebrow("agent")}
          </Text>
          <Text variant="display" className="mt-0.5 text-ink">
            {hubGreeting("agent", firstName(me?.name ?? ""))}
          </Text>
        </View>

        {/* Live Queue Overview Card */}
        {supportAssignment ? (
          <View
            className="mt-4 overflow-hidden rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
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
                value={assignedCount === null ? PENDING_COUNT : String(assignedCount)}
                label="Assigned to you"
                onPress={() => router.navigate("/(agent)/conversations" as Href)}
              />
              <StatTile
                value={unassignedCount === null ? PENDING_COUNT : String(unassignedCount)}
                label="Unassigned pool"
                alert={(unassignedCount ?? 0) > 0}
                accessibilityLabel="Unassigned tickets"
                onPress={() => router.navigate("/(agent)/unassigned" as Href)}
              />
            </View>
          </View>
        ) : null}

        {/* Quick Actions.

            A row rather than the tile pair this was, because there is one of
            them now: `ActionTile` is built to sit beside a sibling and split the
            width, so alone it stretched to full width while its icon, title and
            hint stayed hugging the left corner of it. `ActionRow` is the
            full-width counterpart — icon, title and hint on one line, chevron at
            the end — and it is what Unassigned Pool below already uses.

            Put Knowledge back and this goes back to the pair: uncomment both
            tiles and drop the row. */}
        <ActionRow
          className="mt-4"
          icon={MessageCircle}
          tone="neutral"
          title="Messages"
          hint="Active chats"
          onPress={() => router.navigate("/(agent)/conversations" as Href)}
        />
        {/* <View className="mt-4 flex-row gap-3">
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
        </View> */}

        {recent ? (
          <View className="mt-4">
            <Text variant="label" className="mb-2 uppercase tracking-wider text-muted">
              Recent Conversation
            </Text>
            <RecentThreadCard conversation={recent} />
          </View>
        ) : null}

        {/* Search Knowledge Trigger — hidden for now, along with Knowledge itself.
            Restore by uncommenting. */}
        {/* <View>
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
        </View> */}

        {/* Unassigned Pool Row Card */}
        {supportAssignment ? (
          <ActionRow
            className="mt-4"
            icon={Inbox}
            tone="amber"
            title="Unassigned Pool"
            hint={
              unassignedCount === null
                ? "Checking the pickup queue…"
                : `${unassignedCount} ${unassignedCount === 1 ? "ticket" : "tickets"} waiting for pickup`
            }
            accessibilityLabel="Unassigned pool"
            onPress={() => router.navigate("/(agent)/unassigned" as Href)}
            trailing={
              unassignedCount !== null && unassignedCount > 0 ? (
                <Pill label={`${unassignedCount} new`} tone="amber" />
              ) : null
            }
          />
        ) : null}
      </View>

      {/* FAQ Row — hidden for now. Restore by uncommenting. */}
      {/* <View className="mt-4 px-4">
        <ActionRow
          icon={Headphones}
          tone="neutral"
          title="Frequently Asked Questions"
          hint="Quick references for common customer issues"
          hintLines={1}
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(agent)/faq" as Href)}
        />
      </View> */}
    </HubScroll>
  );
}
