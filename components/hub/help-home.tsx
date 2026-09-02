import { router, type Href } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { colors, screenBottomPad } from "@/lib/tokens";
import { CUSTOMER_HREF } from "@/lib/hub-routes";

// Capsule clearance: max(insets.bottom, 8) + 8 gap + ~60dp capsule height.
const CAPSULE_CLEARANCE = 88;

const LINKS: {
  href: Href;
  label: string;
  hint: string;
  a11y: string;
  Icon: IconComponent;
  // Messages is a sibling tab (navigate, no history stacking); Search/FAQ are
  // stack screens nested inside (home) (push is correct there).
  nav: "navigate" | "push";
}[] = [
  {
    href: CUSTOMER_HREF.messages,
    label: "Message Support",
    hint: "Chat directly with an available support agent",
    a11y: "Message Support",
    Icon: MessageCircle,
    nav: "navigate",
  },
  {
    href: CUSTOMER_HREF.search,
    label: "Search for Help",
    hint: "Instant answers and troubleshooting guides",
    a11y: "Search for help",
    Icon: Search,
    nav: "push",
  },
  {
    href: CUSTOMER_HREF.faq,
    label: "Frequently Asked Questions",
    hint: "Common queries on passwords, billing, and access",
    a11y: "Frequently asked questions",
    Icon: HelpCircle,
    nav: "push",
  },
];

export function HelpHome() {
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {});

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{
        paddingBottom: screenBottomPad(insets.bottom, CAPSULE_CLEARANCE),
      }}
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <View className="flex-row items-center gap-2.5 rounded-2xl bg-primary-soft/60 p-3.5 border border-primary-soft">
        <Clock color={colors.primary} size={18} />
        <Text variant="meta" className="flex-1 text-ink-soft">
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
            onPress={() => (link.nav === "navigate" ? router.navigate(link.href) : router.push(link.href))}
          />
        ))}
      </View>
    </ScrollView>
  );
}
