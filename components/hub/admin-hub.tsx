import { router, type Href } from "expo-router";
import { View } from "react-native";

import {
  Activity,
  // BookOpen, // hidden with Knowledge
  Building2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  // Plus, // hidden with Create New Offer
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
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { latestInboxThread, listUnassignedConversations } from "@/lib/inbox-filter";
// import { knowledgeListHref } from "@/lib/hub-routes"; // hidden with Knowledge
import { ANALYTICS_ACCESS, mayEnter, SCREEN_ACCESS } from "@/lib/route-access";
import { useAnalytics } from "@/lib/use-analytics";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { useViewer } from "@/lib/use-viewer";
import { colors } from "@/lib/tokens";

/** Stands in for a count the list has not answered with yet. An em dash, not a zero. */
const PENDING_COUNT = "—";

export function AdminHub() {
  /*
   * Read off the auth state rather than `getSessionUser()`, because every row
   * below is drawn from `SCREEN_ACCESS` — the table the navigator's guards read
   * too — and a capability granted or revoked while the Hub is up has to move
   * the rows with the screens they open.
   */
  const me = useViewer();
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
   *
   * All three — the tile, the carousel and the chart they open — are there
   * only for a viewer passing `ANALYTICS_ACCESS`, which asks for
   * `view_team_analytics`, what the API checks. Without it `useAnalytics`
   * asks for nothing.
   */
  const showsAnalytics = mayEnter(me, ANALYTICS_ACCESS);
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
            {showsAnalytics ? (
              <StatTile
                value={awaitingReply === null ? PENDING_COUNT : String(awaitingReply)}
                label="Awaiting reply"
                tone="primary"
                alert={awaitingReply !== null && awaitingReply > 0}
                accessibilityLabel="Conversations awaiting a reply"
                onPress={() => router.navigate("/(admin)/conversations" as Href)}
              />
            ) : null}
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
      {showsAnalytics ? (
        <ChartsSection status={analytics.status} charts={analytics.charts} />
      ) : null}

      {/* Administration — the org-wide settings, as opposed to any one thread */}
      <View className="mt-5 gap-3 px-4">
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Administration
        </Text>
        {/* Each row is drawn from `SCREEN_ACCESS`, the table the screen's own
            guard reads, so a row is here exactly when its screen opens. */}
        {mayEnter(me, SCREEN_ACCESS.organizations) ? (
          <ActionRow
            icon={Building2}
            tone="neutral"
            title="Organizations"
            hint="The container every conversation and membership belongs to"
            accessibilityLabel="Organizations"
            onPress={() => router.push("/(admin)/organizations" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS.users) ? (
          <ActionRow
            icon={Users}
            tone="neutral"
            title="Accounts"
            hint="Create, invite, change roles, ban, sign out"
            accessibilityLabel="Accounts"
            onPress={() => router.push("/(admin)/users" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS.labels) ? (
          <ActionRow
            icon={Tags}
            tone="neutral"
            title="Labels"
            hint="The vocabulary every staff member can put on a conversation"
            accessibilityLabel="Labels"
            onPress={() => router.push("/(admin)/labels" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS["saved-responses"]) ? (
          <ActionRow
            icon={MessageSquare}
            tone="neutral"
            title="Saved responses"
            hint="Answers agents insert from the composer"
            accessibilityLabel="Saved responses"
            onPress={() => router.push("/(admin)/saved-responses" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS.broadcasts) ? (
          <ActionRow
            icon={Megaphone}
            tone="neutral"
            title="Broadcasts"
            hint="Send announcements and see who has read them"
            accessibilityLabel="Broadcasts"
            onPress={() => router.push("/(admin)/broadcasts" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS.communities) ? (
          <ActionRow
            icon={Users}
            tone="neutral"
            title="Communities"
            hint="Every community, and creating new ones"
            accessibilityLabel="Communities"
            onPress={() => router.push("/(admin)/communities" as Href)}
          />
        ) : null}
        {mayEnter(me, SCREEN_ACCESS.activity) ? (
          <ActionRow
            icon={Activity}
            tone="neutral"
            title="Audit log"
            hint="What the team has done, newest first"
            accessibilityLabel="Audit log"
            onPress={() => router.push("/(admin)/activity" as Href)}
          />
        ) : null}
      </View>

      {/* Admin Actions. Hidden because offer-add writes to the mock catalog,
          which no screen reads and no API backs. Put it back when offers are real.
      <View className="mt-5 px-4">
        <ActionRow
          icon={Plus}
          tone="primary"
          title="Create New Offer"
          hint="Publish a promotional campaign banner"
          accessibilityLabel="Add offer"
          onPress={() => router.push("/(admin)/offer-add" as Href)}
        />
      </View> */}
    </HubScroll>
  );
}
