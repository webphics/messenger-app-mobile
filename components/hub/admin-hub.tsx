import { router, type Href } from "expo-router";
import { View } from "react-native";

import { BookOpen, MessageCircle, Plus, ShieldCheck, Tags, Users } from "@/components/icons";
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
import { useConversationInbox } from "@/lib/conversation-inbox";
import { latestInboxThread, listUnassignedConversations } from "@/lib/inbox-filter";
import { knowledgeListHref } from "@/lib/hub-routes";
import { getSessionUser } from "@/lib/session";
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

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <StatTile
              value={unassigned === null ? PENDING_COUNT : String(unassigned)}
              label="Unassigned"
              tone="primary"
              alert={unassigned !== null && unassigned > 0}
              accessibilityLabel="Unassigned pool"
              onPress={() => router.navigate("/(admin)/unassigned" as Href)}
            />
            <StatTile
              value={counted === null ? PENDING_COUNT : String(counted.length)}
              label="Conversations"
              accessibilityLabel="Conversations"
              onPress={() => router.navigate("/(admin)/conversations" as Href)}
            />
          </View>
        </View>

        {/* Admin Navigation Quick Grid */}
        <View
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
        </View>

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
      <ChartsSection />

      {/* Administration — the org-wide settings, as opposed to any one thread */}
      <View className="mt-5 gap-3 px-4">
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Administration
        </Text>
        <ActionRow
          icon={Users}
          tone="neutral"
          title="Accounts"
          hint="Create, invite, change roles, ban, sign out"
          accessibilityLabel="Accounts"
          onPress={() => router.push("/(admin)/users" as Href)}
        />
        <ActionRow
          icon={Tags}
          tone="neutral"
          title="Labels"
          hint="The vocabulary every staff member can put on a conversation"
          accessibilityLabel="Labels"
          onPress={() => router.push("/(admin)/labels" as Href)}
        />
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
