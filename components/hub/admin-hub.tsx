import { router, type Href } from "expo-router";
import { View } from "react-native";

import {
  // BookOpen, // hidden with Knowledge
  Building2,
  MessageCircle,
  MessageSquare,
  Plus,
  ShieldCheck,
  Tags,
  Users,
} from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { StatTile } from "@/components/hub/action-tile"; // ActionTile hidden with the Knowledge pair
import { ChartsSection } from "@/components/hub/charts-section";
import { HubHeader } from "@/components/hub/hub-header";
import { HubScroll } from "@/components/hub/hub-scroll";
import { Pill } from "@/components/hub/pill";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { Text } from "@/components/ui/text";
import { USERS_SCREEN_CAPABILITIES, can, canAny } from "@/lib/capabilities";
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { latestInboxThread, listUnassignedConversations } from "@/lib/inbox-filter";
// import { knowledgeListHref } from "@/lib/hub-routes"; // hidden with Knowledge
import { getSessionUser } from "@/lib/session";
import { useAnalytics } from "@/lib/use-analytics";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { colors } from "@/lib/tokens";

/** Stands in for a count the list has not answered with yet. An em dash, not a zero. */
const PENDING_COUNT = "—";

export function AdminHub() {
  const me = getSessionUser();
  const inbox = useConversationInbox();
  /*
   * Real, and org-wide: an Admin's `GET /conversations` is already the broad set
   * their policy grants, so the count is the length of what arrived — and until
   * it arrives there is no count, rather than a zero to be taken back.
   */
  const counted = inbox.status === "ready" ? inbox.conversations : null;
  const recent = counted && me ? latestInboxThread(counted) : undefined;
  /*
   * The pool, out of everything an Admin can see. Both halves come from the
   * list already held, so the tile costs no request — and it is the number
   * worth waking up to, which the mock user count that stood here never was.
   */
  const unassigned = counted ? listUnassignedConversations(counted).length : null;
  // No pool in a Shared queue, so no tile counting it.
  const supportAssignment = useSupportAssignment();
  /*
   * Read once here and handed to the carousel, because the tile below draws
   * from the same overview. Awaiting reply is the API's count rather than the
   * list's: which message came last is not something every row this device
   * holds can say, and the question means the same thing in both modes.
   */
  const analytics = useAnalytics();
  const { awaitingReply } = analytics;

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={"/(admin)/settings" as Href} />

        <View>
          <Text variant="label" className="mt-5 uppercase tracking-wider text-muted">
            {hubEyebrow("admin")}
          </Text>
          <Text variant="display" className="mt-0.5 text-ink">
            {hubGreeting("admin", firstName(me?.name ?? ""))}
          </Text>
        </View>

        {/* System Health / Overview Stats */}
        <View
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

          <View className="mt-3 flex-row gap-3">
            {supportAssignment ? (
              <StatTile
                value={unassigned === null ? PENDING_COUNT : String(unassigned)}
                label="Unassigned"
                tone="primary"
                alert={unassigned !== null && unassigned > 0}
                accessibilityLabel="Unassigned pool"
                onPress={() => router.navigate("/(admin)/unassigned" as Href)}
              />
            ) : null}
            {/* Where Unassigned sits when there is no pool: the first thing
                worth waking up to in a Shared queue. */}
            <StatTile
              value={awaitingReply === null ? PENDING_COUNT : String(awaitingReply)}
              label="Awaiting reply"
              tone="primary"
              alert={awaitingReply !== null && awaitingReply > 0}
              accessibilityLabel="Conversations awaiting a reply"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
            />
            <StatTile
              value={counted === null ? PENDING_COUNT : String(counted.length)}
              label="Conversations"
              accessibilityLabel="Conversations"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
            />
          </View>
        </View>

        {/* Admin Navigation.

            A row rather than the tile pair this was, because there is one of
            them now: `ActionTile` is built to sit beside a sibling and split the
            width, so alone it stretched to full width while its icon, title and
            hint stayed hugging the left corner of it. `ActionRow` is the
            full-width counterpart, and it is what the Administration rows below
            already use.

            Put Knowledge back and this goes back to the pair: uncomment both
            tiles and drop the row. */}
        <ActionRow
          className="mt-4"
          icon={MessageCircle}
          tone="neutral"
          title="Messages"
          hint="All threads"
          onPress={() => router.navigate("/(admin)/conversations" as Href)}
        />
        {/* <View className="mt-4 flex-row gap-3">
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
        </View> */}

        {recent ? (
          <View className="mt-4">
            <Text variant="label" className="mb-2 uppercase tracking-wider text-muted">
              Recent Message
            </Text>
            <RecentThreadCard conversation={recent} />
          </View>
        ) : null}
      </View>

      {/* Analytics & Charts Carousel */}
      <ChartsSection status={analytics.status} charts={analytics.charts} />

      {/* Administration — the org-wide settings, as opposed to any one thread */}
      <View className="mt-5 gap-3 px-4">
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Administration
        </Text>
        {/* Organizations carry editing (`manage_organizations`) and their members
            (`manage_memberships`). Holding neither leaves nothing to do there. */}
        {canAny(me, ["manage_organizations", "manage_memberships"]) ? (
          <ActionRow
            icon={Building2}
            tone="neutral"
            title="Organizations"
            hint="The container every conversation and membership belongs to"
            accessibilityLabel="Organizations"
            onPress={() => router.push("/(admin)/organizations" as Href)}
          />
        ) : null}
        {/* The Users API answers holders of any of these three, as the web Users page does. */}
        {canAny(me, USERS_SCREEN_CAPABILITIES) ? (
          <ActionRow
            icon={Users}
            tone="neutral"
            title="Accounts"
            hint="Create, invite, change roles, ban, sign out"
            accessibilityLabel="Accounts"
            onPress={() => router.push("/(admin)/users" as Href)}
          />
        ) : null}
        {/* Creating and editing labels needs `manage_labels`. */}
        {can(me, "manage_labels") ? (
          <ActionRow
            icon={Tags}
            tone="neutral"
            title="Labels"
            hint="The vocabulary every staff member can put on a conversation"
            accessibilityLabel="Labels"
            onPress={() => router.push("/(admin)/labels" as Href)}
          />
        ) : null}
        {/* This screen writes the library. Reading it happens in the composer, open to all staff. */}
        {can(me, "manage_canned_replies") ? (
          <ActionRow
            icon={MessageSquare}
            tone="neutral"
            title="Saved responses"
            hint="Answers agents insert from the composer"
            accessibilityLabel="Saved responses"
            onPress={() => router.push("/(admin)/saved-responses" as Href)}
          />
        ) : null}
      </View>

      {/* Admin Actions */}
      <View className="mt-5 px-4">
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
