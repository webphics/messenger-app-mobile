import { router } from "expo-router";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { HelpCircle, MessageCircle, Search } from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { ActionTile } from "@/components/hub/action-tile";
import { HubHeader } from "@/components/hub/hub-header";
import { HubScroll } from "@/components/hub/hub-scroll";
import { IconChip } from "@/components/hub/icon-chip";
import { OffersCarousel } from "@/components/hub/offers-carousel";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { latestInboxThread } from "@/lib/inbox-filter";
import { CUSTOMER_HREF } from "@/lib/hub-routes";
import { settleDownEnter } from "@/lib/motion-enter";
import { getSessionUser } from "@/lib/session";

export function CustomerHub() {
  const user = getSessionUser();
  const reduceMotion = useReducedMotion();
  const inbox = useConversationInbox();
  // The most recent real thread, or nothing at all while the list is still out
  // or could not be fetched — the hub is not where a fetch failure is explained,
  // Messages is, so a card that cannot be filled is simply absent.
  const recent =
    inbox.status === "ready" && user ? latestInboxThread(inbox.conversations) : undefined;

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref={CUSTOMER_HREF.settings} />

        <Animated.View entering={settleDownEnter(!!reduceMotion)}>
          <Text variant="label" className="mt-5 uppercase tracking-wider text-muted">
            {hubEyebrow("customer")}
          </Text>
          <Text variant="display" className="mt-0.5 text-ink">
            {hubGreeting("customer", firstName(user?.name ?? ""))}
          </Text>
        </Animated.View>

        <Animated.View
          entering={settleDownEnter(!!reduceMotion, 40)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="Get in touch"
            onPress={() => router.navigate(CUSTOMER_HREF.messages)}
          />
          <ActionTile
            icon={HelpCircle}
            title="Help"
            hint="Browse guides"
            onPress={() => router.navigate(CUSTOMER_HREF.help)}
          />
        </Animated.View>

        {recent ? (
          <View className="mt-4">
            <Text variant="label" className="mb-2 uppercase tracking-wider text-muted">
              Recent Message
            </Text>
            <RecentThreadCard
              conversation={recent}
              organizationNames={
                inbox.status === "ready" ? inbox.organizationNames : undefined
              }
            />
          </View>
        ) : null}

        <Animated.View entering={settleDownEnter(!!reduceMotion, 80)}>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Search for help"
            onPress={() => router.push(CUSTOMER_HREF.search)}
            className="mt-4 flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/5"
          >
            <IconChip icon={Search} tone="neutral" size={32} />
            <Text variant="meta" className="text-muted">
              Search for help & answers…
            </Text>
          </TactilePressable>
        </Animated.View>
      </View>

      <OffersCarousel />

      <View className="mt-4 px-4">
        <ActionRow
          title="Frequently Asked Questions"
          hint="Common questions — passwords, billing, access…"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push(CUSTOMER_HREF.faq)}
        />
      </View>
    </HubScroll>
  );
}
