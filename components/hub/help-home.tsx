import { router, type Href } from "expo-router";
import {
  ChevronRight,
  Clock,
  HelpCircle,
  MessageCircle,
  Search,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";

const LINKS: {
  href: Href;
  label: string;
  hint: string;
  a11y: string;
  Icon: typeof MessageCircle;
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
  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
    >
      <View className="flex-row items-center gap-2.5 rounded-2xl bg-primary-soft/60 p-3.5 border border-primary-soft">
        <Clock color={colors.primary} size={18} />
        <Text className="flex-1 font-sans text-xs font-medium leading-5 text-ink-soft">
          Agents are active 08:00–20:00 weekdays. Community and Offers chat is open 24/7.
        </Text>
      </View>

      <View className="mt-4 gap-3">
        {LINKS.map((link) => (
          <TactilePressable
            key={link.label}
            accessibilityRole="button"
            accessibilityLabel={link.a11y}
            onPress={() => router.push(link.href)}
            className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
              <link.Icon color={colors.primary} size={22} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-sans text-base font-semibold text-ink">
                {link.label}
              </Text>
              <Text className="mt-0.5 font-sans text-xs font-normal text-muted" numberOfLines={1}>
                {link.hint}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </TactilePressable>
        ))}
      </View>
    </ScrollView>
  );
}
