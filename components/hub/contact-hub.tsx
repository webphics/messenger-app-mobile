import { router } from "expo-router";
import { ChevronRight, HelpCircle, MessageCircle, Search } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HubHeader } from "@/components/hub/hub-header";
import { OffersCarousel } from "@/components/hub/offers-carousel";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { firstName } from "@/lib/display";
import { latestInboxThread } from "@/lib/inbox-filter";
import { getDevUser } from "@/lib/dev-user";
import { CONVERSATIONS } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";

export function ContactHub() {
  const insets = useSafeAreaInsets();
  const me = getDevUser();
  const recent = latestInboxThread(getSession().role, me.id, CONVERSATIONS);
  const bottomPad = screenBottomPad(insets.bottom, 24);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: screenTopPad(insets.top),
        paddingBottom: bottomPad,
      }}
    >
      <View className="px-4">
        <HubHeader title="Support" settingsHref="/(contact)/settings" />

        <View className="mt-5">
          <Text className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
            Customer Hub
          </Text>
          <Text className="mt-0.5 font-sans text-2xl font-bold text-ink">
            How can we help, {firstName(me.displayName)}?
          </Text>
        </View>

        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(40)}
          className="mt-4 flex-row gap-3"
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.push("/(contact)/messages")}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <MessageCircle color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Messages
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Get in touch
            </Text>
          </TactilePressable>

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Help"
            onPress={() => router.push("/(contact)/help")}
            className="flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <HelpCircle color={colors.primary} size={22} />
            </View>
            <Text className="mt-3 font-sans text-base font-semibold text-ink">
              Help
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Browse guides
            </Text>
          </TactilePressable>
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
          <View className="size-8 items-center justify-center rounded-xl bg-bg">
            <Search color={colors.muted} size={18} />
          </View>
          <Text className="font-sans text-sm font-normal text-muted">
            Search for help & answers…
          </Text>
        </TactilePressable>
      </View>

      <OffersCarousel />

      <View className="mt-4 px-4">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(contact)/faq")}
          className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="min-w-0 flex-1 pr-2">
            <Text className="font-sans text-base font-semibold text-ink">
              Frequently Asked Questions
            </Text>
            <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
              Common questions — passwords, billing, access…
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </TactilePressable>
      </View>
    </ScrollView>
  );
}
