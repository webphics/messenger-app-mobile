import { router } from "expo-router";
import { ChevronRight, HelpCircle, MessageCircle, Search } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HubHeader } from "@/components/hub/hub-header";
import { OffersCarousel } from "@/components/hub/offers-carousel";
import { RecentThreadCard } from "@/components/hub/recent-thread-card";
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

        <Text className="mt-6 font-sans text-base font-normal text-ink-soft">
          Hi {firstName(me.displayName)}
        </Text>
        <Text className="mt-1 font-sans text-2xl font-bold text-ink">
          How can we help?
        </Text>

        <Animated.View
          entering={FadeInDown.springify().damping(18).stiffness(180).delay(40)}
          className="mt-5 flex-row gap-3"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Messages"
            onPress={() => router.push("/(contact)/messages")}
            className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
          >
            <MessageCircle color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">
              Messages
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Help"
            onPress={() => router.push("/(contact)/help")}
            className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
          >
            <HelpCircle color={colors.primary} size={22} />
            <Text className="mt-3 font-sans text-base font-medium text-ink">
              Help
            </Text>
          </Pressable>
        </Animated.View>

        {recent ? <RecentThreadCard conversation={recent} selfId={me.id} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search for help"
          onPress={() => router.push("/(contact)/search")}
          className="mt-4 min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-md shadow-black/10"
        >
          <Search color={colors.muted} size={20} />
          <Text className="font-sans text-base font-normal text-muted">
            Search for help
          </Text>
        </Pressable>
      </View>

      <OffersCarousel />

      <View className="px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Frequently asked questions"
          onPress={() => router.push("/(contact)/faq")}
          className="mt-6 min-h-11 flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
        >
          <View className="min-w-0 flex-1 pr-2">
            <Text className="font-sans text-base font-medium text-ink">
              Frequently Asked Questions
            </Text>
            <Text className="mt-1 font-sans text-sm font-normal text-muted">
              Common questions — passwords, billing, access…
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
      </View>
    </ScrollView>
  );
}
