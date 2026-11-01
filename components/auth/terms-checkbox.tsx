import { Linking, View } from "react-native";

import { Check } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { LEGAL_LINKS } from "@/lib/legal-links";
import { colors } from "@/lib/tokens";

/**
 * The sign-up step's required "I agree to the Terms of Use" box.
 *
 * The box and its sentence are one control, so there is no dead zone between
 * them; the two documents are links of their own underneath rather than words
 * inside the label, because a tap meant to open one must not tick the box.
 */
export function TermsCheckbox({
  checked,
  onChange,
  error,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  error: string | null;
  disabled?: boolean;
}) {
  return (
    <View className="mt-5 gap-1">
      <TactilePressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel="I agree to the Terms of Use, including zero tolerance for objectionable content and abusive users"
        disabled={disabled}
        onPress={() => onChange(!checked)}
        className="min-h-11 flex-row items-center gap-3"
      >
        <View
          className={cn(
            "size-6 items-center justify-center rounded-md border-2",
            checked ? "border-primary bg-primary" : error ? "border-danger" : "border-line",
          )}
        >
          {checked ? <Check color={colors.primaryForeground} size={14} /> : null}
        </View>
        <Text variant="body" className="min-w-0 flex-1 text-ink">
          I agree to the Terms of Use. There’s no tolerance for objectionable content or abusive
          users.
        </Text>
      </TactilePressable>
      <View className="flex-row flex-wrap gap-x-4 pl-9">
        <TactilePressable
          accessibilityRole="link"
          accessibilityLabel="Terms of Use, opens in your browser"
          onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}
          className="min-h-11 justify-center"
        >
          <Text variant="label" className="text-primary">
            Terms of Use
          </Text>
        </TactilePressable>
        <TactilePressable
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy, opens in your browser"
          onPress={() => void Linking.openURL(LEGAL_LINKS.privacy)}
          className="min-h-11 justify-center"
        >
          <Text variant="label" className="text-primary">
            Privacy Policy
          </Text>
        </TactilePressable>
      </View>
      {error ? (
        <Text variant="label" accessibilityLiveRegion="polite" className="pl-9 font-medium text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
