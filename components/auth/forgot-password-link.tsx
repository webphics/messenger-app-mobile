import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { AlertCircle, Check } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import {
  requestPasswordReset,
  resetRequestNotice,
  USERNAME_RESET_NOTICE,
  type ResetAudience,
  type ResetRequestOutcome,
} from "@/lib/password-reset-api";
import { colors } from "@/lib/tokens";

/**
 * The way out for somebody who cannot prove a password: email a reset link.
 *
 * Drawn under the field it rescues: on the Change password screen, on the
 * two-factor screen's password prompt, and on the sign-in password step.
 * `audience` says whose address it is: the signed-in person's own on the two
 * settings screens, or whatever was typed on sign-in, where the
 * sentence must not say whether the address has an account.
 *
 * `email` is null when the sign-in identifier is a username. The API sends
 * reset links to an address only, so the control says so rather than guessing
 * one.
 *
 * The link opens the web page that sets the password, so nothing here changes
 * when it succeeds. What it owes the person is the sentence saying where the
 * link went and where it leads, which `lib/password-reset-api` words, and which
 * stays until they leave. The control stays too, because asking again is a fair
 * answer to an email that never arrived and the rate limit is the API's to
 * apply.
 */
export function ForgotPasswordLink({
  email,
  audience,
  disabled = false,
}: {
  email: string | null;
  audience: ResetAudience;
  /** Another request on the same screen is out. */
  disabled?: boolean;
}) {
  const [sending, setSending] = useState(false);
  /**
   * The last answer, and the address it was for. A different address on screen
   * is a different request, so an answer is only drawn while its address is
   * still the one typed. `outcome` is null for a press with no address to send to.
   */
  const [answer, setAnswer] = useState<{
    email: string | null;
    outcome: ResetRequestOutcome | null;
  } | null>(null);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onPress = useCallback(() => {
    if (sending || disabled) return;
    if (!email) {
      setAnswer({ email: null, outcome: null });
      hapticWarning();
      return;
    }
    setSending(true);
    setAnswer(null);

    void requestPasswordReset(email).then((next) => {
      if (!live.current) return;
      setSending(false);
      setAnswer({ email, outcome: next });
      if (next.kind === "sent") hapticSuccess();
      else hapticWarning();
    });
  }, [disabled, email, sending]);

  const current = answer && answer.email === email ? answer : null;
  const notice = !current
    ? null
    : current.outcome && current.email
      ? resetRequestNotice(current.outcome, current.email, audience)
      : USERNAME_RESET_NOTICE;
  const sent = current?.outcome?.kind === "sent";

  return (
    <View className="mt-1.5">
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Forgot password?"
        accessibilityHint={
          email
            ? `Emails a link for setting a new password to ${email}`
            : "Reset links go to an email address"
        }
        accessibilityState={{ disabled: sending || disabled, busy: sending }}
        // Disabled only while a request is out, like the submit button.
        disabled={sending || disabled}
        onPress={onPress}
        className="min-h-11 flex-row items-center gap-2 self-start"
      >
        <Text variant="label" className="text-primary">
          Forgot password?
        </Text>
        {sending ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </TactilePressable>

      {notice ? (
        <View
          className={
            sent
              ? "mt-1 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5"
              : "mt-1 flex-row items-start gap-2.5 rounded-2xl border border-danger/30 bg-surface p-3.5"
          }
        >
          <View className="mt-0.5">
            {sent ? (
              <Check color={colors.primary} size={16} />
            ) : (
              <AlertCircle color={colors.danger} size={16} />
            )}
          </View>
          <Text
            accessibilityLiveRegion="polite"
            variant="label"
            className={`min-w-0 flex-1 font-normal leading-5 ${sent ? "text-ink" : "text-danger"}`}
          >
            {notice}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
