import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View, type TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, Check, Eye, EyeOff } from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import type { ApiFailure } from "@/lib/api-result";
import { useAuth } from "@/lib/auth-context";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { changePassword, setPassword } from "@/lib/password-api";
import {
  checkPassword,
  EMPTY_PASSWORD_DRAFT,
  PASSWORD_COPY,
  PASSWORD_LENGTH_RULE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  asksForCurrentPassword,
  passwordMode,
  type PasswordDraft,
  type PasswordField,
  type PasswordMode,
} from "@/lib/password-rules";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * Setting a first password, or changing one, on the account this phone is
 * signed in to.
 *
 * Pushed from the account card on Settings and living outside the three role
 * groups, per ADR-0012: governing your own account belongs to the account rather
 * than to the role, so nothing here reads one.
 *
 * ## The screen does not ask which of the two it is doing
 *
 * `hasPassword` on the signed-in person answers it, and `lib/password-rules`
 * turns that into a mode, the fields it draws and the sentences it uses. That is
 * ticket 06's own acceptance criterion: asking somebody whether they have a
 * password is asking them a question the app already has the answer to. There is
 * no control here for switching modes and nowhere for one to go.
 *
 * ## Why the mode is frozen on the way in
 *
 * A successful write flips `hasPassword` to true, and the person is still
 * standing on this screen when it does. Read live, the form would rearrange
 * itself under them the instant it succeeded: a *Set a password* screen would
 * grow a current-password field and retitle itself to *Change your password*,
 * over a success line saying the opposite. So the mode is taken once, when the
 * screen opens, and the screen it turned into is the screen somebody finishes
 * reading. Coming back to it opens the other one, which is correct, because by
 * then they do have a password.
 *
 * ## What happens to the signed-in person afterwards
 *
 * `lib/password-api` brings the module mirror and the Kept person into line, and
 * this hands the answer to `accountUpdated` so the auth state agrees with both.
 * Without that last step the password row on Settings would go on offering to
 * *set* a password this person had just set. See `lib/auth-context`.
 */

/** The fields, as the person is asked for them. */
const FIELD_LABELS: Record<PasswordField, string> = {
  current: "Current password",
  next: "New password",
  confirmation: "Repeat new password",
};

/**
 * What a write that did not happen says.
 *
 * `components/settings/account-sessions-screen`'s shape and the same four cases,
 * because a person answers each of them differently. A refusal speaks in the
 * API's own words, which on this screen is usually the one sentence that matters
 * most: that the current password was wrong. An expired session says nothing,
 * because the auth layer is already on its way to sign-in and a line about a
 * password would arrive on a screen that is leaving.
 */
function writeRefusal(failure: ApiFailure): string {
  switch (failure.kind) {
    case "unreachable":
      return "Could not reach the server, so your password was not changed. Check your connection and try again.";
    case "refused":
      return failure.message;
    case "malformed":
      return "The server answered with something this app did not understand. Your password may not have changed.";
    case "unauthorised":
      return "";
  }
}

/** One password field, with its reveal control and its own error beneath it. */
function PasswordInput({
  field,
  value,
  error,
  inputRef,
  onChangeText,
  onSubmitEditing,
  returnKeyType,
}: {
  field: PasswordField;
  value: string;
  error: string | undefined;
  inputRef: React.RefObject<TextInput | null>;
  onChangeText: (next: string) => void;
  onSubmitEditing: () => void;
  returnKeyType: "next" | "go";
}) {
  const [revealed, setRevealed] = useState(false);
  const label = FIELD_LABELS[field];

  return (
    <View className="mt-4">
      <Text variant="label" className="mb-1.5 text-ink">
        {label}
      </Text>
      <View className="relative justify-center">
        <Input
          ref={inputRef}
          className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
          placeholder="••••••••"
          accessibilityLabel={label}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          // Both, deliberately: Android reads `autoComplete` and iOS reads
          // `textContentType`, and without the pair a password manager has
          // nothing to offer. The current field is the one that already exists,
          // so it asks for the stored password; the other two are the one being
          // created, which is what makes a manager offer to generate and then
          // save it. `newPassword` on the confirmation too, so the two fields
          // are offered the same generated value rather than one of them being
          // handed the old one.
          autoComplete={field === "current" ? "current-password" : "new-password"}
          textContentType={field === "current" ? "password" : "newPassword"}
          // Only where a new password is being typed. On the current field it
          // would mean the platform inventing a replacement for the very value
          // being asked to prove.
          passwordRules={
            field === "current"
              ? undefined
              : `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH};`
          }
          maxLength={PASSWORD_MAX_LENGTH}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          value={value}
          onChangeText={onChangeText}
        />
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => setRevealed((prev) => !prev)}
          className="absolute right-3 size-8 items-center justify-center rounded-full"
        >
          {revealed ? (
            <EyeOff color={colors.inkSoft} size={18} />
          ) : (
            <Eye color={colors.muted} size={18} />
          )}
        </TactilePressable>
      </View>

      {/* Under the field it is about, which is where somebody reading an error
          is already looking. */}
      {error ? (
        <View
          className="mt-1.5 flex-row items-center gap-1.5"
          accessibilityLiveRegion="polite"
        >
          <AlertCircle color={colors.danger} size={14} />
          <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
            {error}
          </Text>
        </View>
      ) : field === "next" ? (
        // The rule, before submission rather than through a rejection, which is
        // ticket 06's own criterion. Replaced by the error when there is one,
        // because a rule and a complaint about the same field stacked on top of
        // each other is two things to read where one would do.
        <Text variant="label" className="mt-1.5 font-normal leading-5 text-muted">
          {PASSWORD_LENGTH_RULE}
        </Text>
      ) : null}
    </View>
  );
}

export function AccountPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, accountUpdated } = useAuth();

  /**
   * The mode, taken once. See the header comment: reading it live would
   * rearrange the form under somebody the moment their write succeeded.
   *
   * A session that is not signed-in cannot reach this screen, since the gate in
   * front of every screen sends a signed-out person to sign-in. The fallback is
   * therefore a guard against a direct navigation rather than a state anybody
   * arrives in, and `set` is the safer of the two to guess at: it asks for
   * nothing that does not exist.
   */
  const [mode] = useState<PasswordMode>(() =>
    state.status === "signed-in" ? passwordMode(state.user) : "set",
  );

  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const refs: Record<PasswordField, React.RefObject<TextInput | null>> = {
    current: useRef<TextInput>(null),
    next: useRef<TextInput>(null),
    confirmation: useRef<TextInput>(null),
  };

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const copy = PASSWORD_COPY[mode];

  const edit = useCallback((field: PasswordField, value: string) => {
    setDraft((held) => ({ ...held, [field]: value }));
    // The complaint about a field goes the moment somebody acts on it, rather
    // than standing until the next submit tells them again what they are in the
    // middle of fixing.
    setErrors((held) => {
      if (held[field] === undefined) return held;
      const next = { ...held };
      delete next[field];
      return next;
    });
    setFailure(null);
    setSaved(false);
  }, []);

  const onSubmit = useCallback(() => {
    if (saving) return;

    // The button is never disabled for an incomplete form, per AGENTS.md: an
    // incomplete submission is how its validation gets surfaced at all. So the
    // check runs here and answers for whatever has been typed, including
    // nothing.
    const check = checkPassword(mode, draft);
    setErrors(check.errors);

    if (check.submission === null) {
      hapticWarning();
      if (check.firstError) refs[check.firstError].current?.focus();
      return;
    }

    const submission = check.submission;
    setSaving(true);
    setFailure(null);
    setSaved(false);

    const write =
      submission.mode === "set"
        ? setPassword(submission.newPassword)
        : changePassword({
            currentPassword: submission.currentPassword,
            newPassword: submission.newPassword,
          });

    void write.then((result) => {
      if (!live.current) return;
      setSaving(false);

      if (!result.ok) {
        hapticWarning();
        setFailure(writeRefusal(result.failure));
        // A refused change is almost always the current password being wrong,
        // and the field it is about is where somebody has to go next.
        if (result.failure.kind === "refused" && asksForCurrentPassword(mode)) {
          refs.current.current?.focus();
        }
        return;
      }

      hapticSuccess();
      // The third of the three places the signed-in person is held, and the one
      // `lib/password-api` cannot reach. Without it the Settings row behind this
      // screen goes on offering to set a password that now exists.
      accountUpdated(result.value);
      setDraft(EMPTY_PASSWORD_DRAFT);
      setSaved(true);
    });
  }, [accountUpdated, draft, mode, refs, saving]);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          {copy.title}
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: screenBottomPad(insets.bottom, 24) + keyboardInset,
        }}
        {...scrollProps}
      >
        <View ref={contentRef}>
          <Text variant="label" className="font-normal leading-5 text-muted">
            {copy.description}
          </Text>

          {/* A write that did not happen, in the API's own words where it had
              any. Above the fields rather than below the button, because the
              field it usually sends somebody back to is the first one. */}
          {failure ? (
            <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-danger/30 bg-surface p-3.5">
              <View className="mt-0.5">
                <AlertCircle color={colors.danger} size={16} />
              </View>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="min-w-0 flex-1 font-normal leading-5 text-danger"
              >
                {failure}
              </Text>
            </View>
          ) : null}

          {/* Says the session survived, which is the half of this a person
              cannot see for themselves and the half they would otherwise sit
              waiting to find out. */}
          {saved ? (
            <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5">
              <View className="mt-0.5">
                <Check color={colors.primary} size={16} />
              </View>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="min-w-0 flex-1 font-normal leading-5 text-ink"
              >
                {copy.success}
              </Text>
            </View>
          ) : null}

          {asksForCurrentPassword(mode) ? (
            <PasswordInput
              field="current"
              value={draft.current}
              error={errors.current}
              inputRef={refs.current}
              returnKeyType="next"
              onChangeText={(value) => edit("current", value)}
              onSubmitEditing={() => refs.next.current?.focus()}
            />
          ) : null}

          <PasswordInput
            field="next"
            value={draft.next}
            error={errors.next}
            inputRef={refs.next}
            returnKeyType="next"
            onChangeText={(value) => edit("next", value)}
            onSubmitEditing={() => refs.confirmation.current?.focus()}
          />

          <PasswordInput
            field="confirmation"
            value={draft.confirmation}
            error={errors.confirmation}
            inputRef={refs.confirmation}
            returnKeyType="go"
            onChangeText={(value) => edit("confirmation", value)}
            onSubmitEditing={onSubmit}
          />

          <Button
            className="mt-6 min-h-12"
            accessibilityLabel={copy.submitLabel}
            accessibilityState={{ disabled: saving }}
            // Disabled only once the request is out, per AGENTS.md. An
            // incomplete form is submittable on purpose: that is how its
            // validation reaches somebody at all.
            disabled={saving}
            onPress={onSubmit}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : null}
            <Text>{copy.submitLabel}</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
