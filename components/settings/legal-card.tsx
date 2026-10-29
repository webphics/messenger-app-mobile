import { Alert, Linking, View } from "react-native";

import {
  ExternalLink,
  FileText,
  Info,
  Mail,
  Shield,
  type IconComponent,
} from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { LEGAL_LINKS, SUPPORT_EMAIL } from "@/lib/legal-links";
import { colors } from "@/lib/tokens";

/**
 * The privacy policy, the terms and a way to reach support, on the one shared
 * Settings screen and so on every role's.
 *
 * Each row leaves the app: the documents are web pages, kept in one place so
 * the app and both store listings cannot drift apart. The trailing icon says so
 * rather than a chevron, which on this screen means "pushes a screen".
 */

type LegalRow = {
  key: string;
  icon: IconComponent;
  title: string;
  url: string;
};

const ROWS: LegalRow[] = [
  { key: "privacy", icon: Shield, title: "Privacy policy", url: LEGAL_LINKS.privacy },
  { key: "terms", icon: FileText, title: "Terms of use", url: LEGAL_LINKS.terms },
  {
    key: "support",
    icon: Mail,
    title: "Contact support",
    url: `mailto:${SUPPORT_EMAIL}`,
  },
];

function open(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert("Could not open link", url.replace(/^mailto:/, ""));
  });
}

export function LegalCard() {
  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
      <View className="mb-3 flex-row items-center gap-2 border-b border-line/60 pb-3">
        <Info color={colors.muted} size={16} />
        <Text variant="label" className="uppercase tracking-wider text-muted">
          About
        </Text>
      </View>

      {ROWS.map((row) => {
        const Icon = row.icon;
        return (
          <TactilePressable
            key={row.key}
            accessibilityRole="link"
            accessibilityLabel={row.title}
            onPress={() => open(row.url)}
            className="min-h-12 flex-row items-center gap-3 py-1.5"
          >
            <Icon color={colors.primary} size={18} />
            <Text variant="meta" className="min-w-0 flex-1 font-semibold text-ink" numberOfLines={1}>
              {row.title}
            </Text>
            <ExternalLink color={colors.muted} size={16} />
          </TactilePressable>
        );
      })}
    </View>
  );
}
