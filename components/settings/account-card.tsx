import { router } from "expo-router";
import { View } from "react-native";

import {
  ChevronRight,
  KeyRound,
  Shield,
  ShieldCheck,
  User,
  UserX,
  type IconComponent,
} from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/lib/tokens";
import type { SessionUser } from "@/lib/types";

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
 * ## A list of rows rather than markup
 *
 * What varies between rows is data: a row is an icon, a name, a sentence saying
 * what is behind it, and where it goes. Adding one is adding an entry to the
 * list `accountRows` returns.
 *
 * Two of them read the signed-in person, which is why that list is a
 * function rather than a constant. The password row says which of the two things
 * its screen will do, and the two-factor row says whether two-factor is on,
 * because a row that made somebody push to find out the state would be a push
 * for nothing. Both facts come off `SessionUser` and neither costs a request.
 *
 * The rows say it in a few words and the screens behind them say it properly.
 * That split is deliberate: a card of rows that each explained themselves
 * fully would be taller than the profile card above it, and none of it would be
 * read.
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

/**
 * The rows, for this account.
 *
 * `account` is null only between a sign-out and the navigation landing, which is
 * a frame or two of a screen that is leaving. The rows still draw, worded for an
 * account this card knows nothing about, rather than the card collapsing and
 * taking the layout with it on the way out.
 */
function accountRows(account: SessionUser | null): AccountRow[] {
  return [
    {
      key: "sessions",
      icon: Shield,
      title: "Where you’re signed in",
      hint: "See every device on your account and end the ones you don’t recognise.",
      open: () => router.push("/account/sessions"),
    },
    {
      key: "password",
      icon: KeyRound,
      // The screen decides this for itself off the same flag, so the row is
      // reporting what it will find rather than telling it what to be.
      title: account?.hasPassword ? "Change your password" : "Set a password",
      hint: account?.hasPassword
        ? "Replace your password by proving the one you use now."
        : "This account signs in by link or with Google. Add a password as another way in.",
      open: () => router.push("/account/password"),
    },
    {
      key: "two-factor",
      icon: ShieldCheck,
      title: "Two-factor authentication",
      // The state, in the row, because it is the thing somebody opens this to
      // find out. Named in words rather than shown as a tint, so it reaches a
      // screen reader and anybody not reading colour.
      hint: account?.twoFactorEnabled
        ? "On. Turn it off, or generate fresh backup codes."
        : "Off. Codes from an authenticator app are not required to sign in.",
      open: () => router.push("/account/two-factor"),
    },
    {
      key: "delete",
      icon: UserX,
      title: "Delete account",
      hint: "Remove your account and the details on it for good.",
      open: () => router.push("/account/delete"),
    },
  ];
}

export function AccountCard() {
  // From the provider rather than the module mirror, for the reason
  // `components/settings/settings-screen` gives: this card has to redraw when
  // the person changes in place, and `getSessionUser()` re-renders for nobody.
  // That is exactly what the password and two-factor screens do to it on their
  // way back, through `accountUpdated`.
  const { state } = useAuth();
  const account = state.status === "signed-in" ? state.user : null;
  const rows = accountRows(account);

  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
      <View className="mb-3 flex-row items-center gap-2 border-b border-line/60 pb-3">
        <User color={colors.muted} size={16} />
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Account
        </Text>
      </View>

      {rows.map((row) => {
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
