import { router } from "expo-router";
import { View } from "react-native";

import {
  ChevronRight,
  Shield,
  User,
  type IconComponent,
} from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";

/**
 * The account section: the things somebody governs about their own account
 * rather than about their work.
 *
 * On the one shared Settings screen, and therefore on every role's, which is the
 * whole of ADR-0012's easier version of root ADR 0008's problem. That ADR built
 * a shared feature and mounted it under two route groups because the two web
 * shells mount different providers; here `components/settings/settings-screen`
 * is already one component that `(admin)`, `(agent)` and `(customer)` all
 * render, so a card on it inherits the property without a fourth route group and
 * without anything branching on a role. There is deliberately no role check in
 * this file and nowhere for one to go.
 *
 * Every row pushes rather than expands. A sessions list and, later, a two-factor
 * setup flow are both too tall to inline under the profile card, and the screens
 * they open live outside the three role groups beside `chat/`, `wall/` and
 * `community/` for the same reason this card does not branch: they belong to the
 * account.
 *
 * ## One row today, and a list rather than a row
 *
 * Tickets 06 and 07 add a password row and a two-factor row to this same card,
 * so what varies between rows is data and not markup: a row is an icon, a name,
 * a sentence saying what is behind it, and where it goes. Adding one is adding
 * an entry to `ROWS`. Neither of those two is here yet and neither screen
 * exists, so nothing below hints at them.
 */

type AccountRow = {
  key: string;
  icon: IconComponent;
  title: string;
  /**
   * What is behind the row, in one sentence. Drawn rather than hidden in a
   * tooltip: inline help first, and a row named "Where you're signed in" still
   * benefits from somebody knowing they can end a session from it before they
   * push.
   */
  hint: string;
  open: () => void;
};

const ROWS: AccountRow[] = [
  {
    key: "sessions",
    icon: Shield,
    title: "Where you’re signed in",
    hint: "See every device on your account and end the ones you don’t recognise.",
    open: () => router.push("/account/sessions"),
  },
];

export function AccountCard() {
  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
      <View className="mb-3 flex-row items-center gap-2 border-b border-line/60 pb-3">
        <User color={colors.muted} size={16} />
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Account
        </Text>
      </View>

      {ROWS.map((row) => {
        const Icon = row.icon;
        return (
          <TactilePressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            accessibilityHint={row.hint}
            onPress={row.open}
            className="min-h-12 flex-row items-center gap-3 py-1.5"
          >
            <Icon color={colors.primary} size={18} />
            {/* `min-w-0` so the sentence truncates inside the row rather than
                pushing the chevron off the edge of the card. */}
            <View className="min-w-0 flex-1">
              <Text variant="meta" className="font-semibold text-ink" numberOfLines={1}>
                {row.title}
              </Text>
              <Text
                variant="label"
                className="font-normal leading-5 text-muted"
                numberOfLines={2}
              >
                {row.hint}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </TactilePressable>
        );
      })}
    </View>
  );
}
