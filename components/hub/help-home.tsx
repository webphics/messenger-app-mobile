import { router, type Href } from "expo-router";
import { ScrollView, View } from "react-native";

import {
  Clock,
  HelpCircle,
  MessageCircle,
  Search,
  type IconComponent,
} from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { Text } from "@/components/ui/text";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";

const LINKS: {
  href: Href;
  label: string;
  hint: string;
  a11y: string;
  Icon: IconComponent;
}[] = [
  {
    href: "/(contact)/messages",
    label: "Message Support",
    hint: "Chat directly with an available support agent",
    a11y: "Message Support",
    Icon: MessageCircle,
  },
  {
    href: "/(contact)/search",
    label: "Search for Help",
    hint: "Instant answers and troubleshooting guides",
    a11y: "Search for help",
    Icon: Search,
  },
  {
    href: "/(contact)/faq",
    label: "Frequently Asked Questions",
    hint: "Common queries on passwords, billing, and access",
    a11y: "Frequently asked questions",
    Icon: HelpCircle,
  },
];

export function HelpHome() {
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {});

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <View className="flex-row items-center gap-2.5 rounded-2xl bg-primary-soft/60 p-3.5 border border-primary-soft">
        <Clock color={colors.primary} size={18} />
        <Text className="flex-1 font-sans text-xs font-medium leading-5 text-ink-soft">
          Agents are active 08:00–20:00 weekdays. Community and Offers chat is open 24/7.
        </Text>
      </View>

      <View className="mt-4 gap-3">
        {LINKS.map((link) => (
          <ActionRow
            key={link.label}
            className="rounded-3xl"
            icon={link.Icon}
            title={link.label}
            hint={link.hint}
            hintLines={1}
            accessibilityLabel={link.a11y}
            onPress={() => router.push(link.href)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
