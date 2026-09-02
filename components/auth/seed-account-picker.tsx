import { View } from "react-native";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import {
  SEED_ACCOUNTS,
  seedAccountLabel,
  type SeedAccount,
} from "@/lib/seed-accounts";

/**
 * Pick which seed account to sign in as. Development builds only.
 *
 * The Settings role switcher used to sit where this does in a person's head —
 * three role-shaped chips — and it changed the viewer's own role, which the API
 * will not accept and a shipped app must therefore never appear to offer. This
 * keeps the shape and drops the claim: a chip fills the sign-in form with
 * another account's credentials and stops there. Signing in is still the
 * ordinary password path, so the role that comes back is the server's answer
 * about *that* account, not this control's opinion of it.
 *
 * Filling rather than submitting is the honest half. The credentials it is about
 * to send are in the fields anyone else types into, and the button that sends
 * them is the same button — there is no privileged route through this component
 * into a session.
 *
 * Renders nothing when nothing is configured, which in a release build is
 * always: `SEED_ACCOUNTS` is behind `__DEV__`. That is also why there is no
 * `__DEV__` check here — an empty list is already an absent control, and a
 * second guard would be a second thing to keep true.
 */

type SeedAccountPickerProps = {
  /**
   * What the form currently holds. Both fields, not just the address: a chip
   * ticked on an email match alone would keep reading “chosen” after someone
   * edited the password out from under it, which is the form claiming to hold
   * credentials it does not have.
   */
  filled: { email: string; password: string };
  onSelect: (account: SeedAccount) => void;
  disabled?: boolean;
};

export function SeedAccountPicker({
  filled,
  onSelect,
  disabled = false,
}: SeedAccountPickerProps) {
  if (SEED_ACCOUNTS.length === 0) return null;

  return (
    <View className="mt-5 rounded-2xl border border-dashed border-line bg-line/20 p-3.5">
      <Text variant="label" className="uppercase tracking-wider text-muted">
        Dev build · seed accounts
      </Text>
      <Text variant="meta" className="mt-1.5 text-muted">
        Fills the form above. The role you land in is the server’s, not this
        control’s.
      </Text>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {SEED_ACCOUNTS.map((account) => {
          const label = seedAccountLabel(account.role);
          const chosen =
            account.email === filled.email.trim() &&
            account.password === filled.password;

          return (
            <TactilePressable
              key={account.role}
              accessibilityRole="button"
              accessibilityLabel={`Use the ${label} seed account`}
              accessibilityHint={`Fills in ${account.email} and its password. Sign in to use it.`}
              accessibilityState={{ selected: chosen, disabled }}
              disabled={disabled}
              onPress={() => onSelect(account)}
              className={`min-h-11 justify-center rounded-xl border px-3.5 ${
                chosen ? "border-primary bg-primary-soft" : "border-line/80 bg-surface"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <Text
                variant="label"
                className={chosen ? "font-bold text-primary" : "text-ink"}
              >
                {/* A tick as well as the fill, so “which one is in the form” is
                    not carried by colour alone. */}
                {chosen ? `${label} ✓` : label}
              </Text>
            </TactilePressable>
          );
        })}
      </View>
    </View>
  );
}
