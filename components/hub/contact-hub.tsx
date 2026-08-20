import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

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
import { firstName } from "@/lib/display";
import { hubEyebrow, hubGreeting } from "@/lib/hub-chrome";
import { latestInboxThread } from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

export function ContactHub() {
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);

  return (
    <HubScroll>
      <View className="px-4">
        <HubHeader settingsHref="/(contact)/settings" />

        <View className="mt-5">
          <Text className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
            {hubEyebrow(me.role)}
          </Text>
          <Text className="mt-0.5 font-sans text-2xl font-bold text-ink">
            {hubGreeting(me.role, firstName(me.displayName))}
          </Text>
        </View>

        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(40)}
          className="mt-4 flex-row gap-3"
        >
          <ActionTile
            icon={MessageCircle}
            title="Messages"
            hint="Get in touch"
            onPress={() => router.push("/(contact)/messages")}
          />
          <ActionTile
            icon={HelpCircle}
            title="Help"
            hint="Browse guides"
            onPress={() => router.push("/(contact)/help")}
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

        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Search for help"
          onPress={() => router.push("/(contact)/search")}
          className="mt-4 flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/5"
        >
          <IconChip icon={Search} tone="neutral" size={32} />
          <Text className="font-sans text-sm font-normal text-muted">
            Search for help & answers…
          </Text>
        </TactilePressable>
      </View>

      <OffersCarousel />

      <View className="mt-4 px-4">
        <ActionRow
          title="Frequently Asked Questions"
          hint="Common questions — passwords, billing, access…"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(contact)/faq")}
        />
      </View>
    </HubScroll>
  );
}
