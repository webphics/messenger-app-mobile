import { router, type Href } from "expo-router";
import {
  ChevronRight,
  HelpCircle,
  MessageCircle,
  Search,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

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
    hint: "Open your conversations",
    a11y: "Message Support",
    Icon: MessageCircle,
  },
  {
    href: "/(contact)/search",
    label: "Search for help",
    hint: "Find answers quickly",
    a11y: "Search for help",
    Icon: Search,
  },
  {
    href: "/(contact)/faq",
    label: "Frequently Asked Questions",
    hint: "Passwords, billing, access…",
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
      <Text className="font-sans text-base font-normal text-ink-soft">
        Agents are online 08:00–20:00 weekdays. Offers chat is always open.
      </Text>

      {LINKS.map((link, i) => (
        <Pressable
          key={link.label}
          accessibilityRole="button"
          accessibilityLabel={link.a11y}
          onPress={() => router.push(link.href)}
          className={`min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10 ${i === 0 ? "mt-4" : "mt-3"}`}
        >
          <link.Icon color={colors.primary} size={22} />
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-base font-medium text-ink">
              {link.label}
            </Text>
            <Text className="mt-0.5 font-sans text-sm font-normal text-muted">
              {link.hint}
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
