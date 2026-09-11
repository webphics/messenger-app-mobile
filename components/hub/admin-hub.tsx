import { router, type Href } from "expo-router";
import { View } from "react-native";

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
import { useConversationInbox } from "@/lib/conversation-inbox";
import { latestInboxThread } from "@/lib/inbox-filter";
import { knowledgeListHref } from "@/lib/hub-routes";
import { PEOPLE } from "@/lib/mock-data";
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
  // Still the mock directory: user management is its own endpoint and its own
  // ticket, and this tile links to the screen that reads it.
  const onlineCount = PEOPLE.filter((p) => p.isOnline).length;
  const totalUsers = PEOPLE.length;

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
              value={String(onlineCount)}
              suffix={`/${totalUsers}`}
              label="Active users"
              accessibilityLabel="People"
              onPress={() => router.navigate("/(admin)/contacts" as Href)}
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
