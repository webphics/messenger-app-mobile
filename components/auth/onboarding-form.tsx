import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  type TextInput,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { ROLE_HREF } from "@/lib/hub-routes";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import { colors, screenTopPad } from "@/lib/tokens";

/**
 * The one question an account has to answer before it can use the product.
 *
 * Reached by the gate in `lib/onboarding-gate`, never by a control — which is
 * why there is nothing on this screen that goes back. The account is signed in
 * and the name is missing; there is no earlier state to return to, and a Cancel
 * would land on a Hub the gate would bounce straight back here.
 *
 * Two fields and only one of them is a gate, which is the web client's shape
 * (`onboarding-schema.ts`). The phone is offered at the one moment somebody is
 * already filling a form, and is free to skip.
 */

/** The API's bound, mirrored so a long name is refused here rather than as a `422`. */
const NAME_MAX = 255;

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View
      className="mt-1.5 flex-row items-center gap-1.5"
      accessibilityLiveRegion="polite"
    >
      <AlertCircle color={colors.danger} size={14} />
      <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
        {message}
      </Text>
    </View>
  );
}

export function OnboardingForm() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, saveProfile } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<TextInput>(null);

  /**
   * Navigating from the answer rather than from the state, unlike the sign-in
   * screen.
   *
   * There, the destination is the role the server assigned and the machine is
   * what learns it. Here the session is already resolved and the only thing
   * that changes is the name, so waiting on an effect over `state` would mean
   * rendering this form once more with a name it no longer needs.
   */
  async function onSubmit() {
    if (saving) return;

    const trimmed = name.trim();
    const nextName =
      trimmed === ""
        ? "Enter your name"
        : trimmed.length > NAME_MAX
          ? `Name must be ${NAME_MAX} characters or fewer`
          : null;

    setNameError(nextName);
    if (nextName) {
      hapticWarning();
      nameRef.current?.focus();
      return;
    }

    setNotice(null);
    setSaving(true);
    try {
      // The phone is sent as typed or as null, never omitted: `PUT /auth/profile`
      // clears the stored number when the body leaves it out, so omitting it
      // here would be a silent write rather than a skipped field.
      const trimmedPhone = phone.trim();
      const result = await saveProfile({
        name: trimmed,
        phone: trimmedPhone === "" ? null : trimmedPhone,
      });

      if (!result.ok) {
        hapticWarning();
        // An expired session needs nothing said here: the provider has already
        // been told, and the gate in front of this screen will send them to
        // sign-in with its own explanation.
        if (result.failure.kind === "unauthorised") return;

        setNotice(
          result.failure.kind === "refused"
            ? result.failure.message
            : result.failure.kind === "unreachable"
              ? "Could not reach the server. Check your connection and try again."
              : "The server sent something this app could not read.",
        );
        return;
      }

      hapticSuccess();
      router.replace(ROLE_HREF[result.value.role]);
    } finally {
      setSaving(false);
    }
  }

  // The gate only ever routes a signed-in person here, so this is a guard
  // against a direct navigation rather than a state anyone reaches.
  const role = state.status === "signed-in" ? state.user.role : null;

  return (
    <View
      ref={contentRef}
      collapsable={false}
      className="flex-1 bg-bg"
      style={{ paddingBottom: keyboardInset }}
    >
      <ScrollView
        {...scrollProps}
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: Math.max(screenTopPad(insets.top), 24),
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Animated.View
          entering={settleDownEnter(!!reduceMotion)}
          className="items-center"
        >
          <Text variant="display" className="text-center text-ink">
            One last thing
          </Text>
          <Text variant="meta" className="mt-1 text-center text-muted">
            Tell us what to call you
          </Text>
        </Animated.View>

        <Animated.View
          entering={settleEnter(!!reduceMotion, 60)}
          className="mt-6 rounded-3xl border border-line/70 bg-surface p-5 shadow-md shadow-black/8"
        >
          <View>
            <Text variant="label" className="mb-1.5 text-ink">
              Your name
            </Text>
            <Input
              ref={nameRef}
              className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
              placeholder="Jordan Ellis"
              accessibilityLabel="Your name"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              autoFocus
              value={name}
              onChangeText={(v) => {
                setName(v);
                setNameError(null);
              }}
            />
            <FieldError message={nameError} />
          </View>

          <View className="mt-4">
            <Text variant="label" className="mb-1.5 text-ink">
              Phone{" "}
              <Text variant="label" className="text-muted">
                (optional)
              </Text>
            </Text>
            <Input
              className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
              placeholder="+44 7700 900000"
              accessibilityLabel="Phone number, optional"
              keyboardType="phone-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={() => void onSubmit()}
              value={phone}
              onChangeText={setPhone}
            />
            {/* No validation behind it. The API parses the number and is the
                authority on what a valid one is; refusing a shape here would be
                this screen inventing a rule it cannot enforce. */}
            <Text variant="meta" className="mt-1.5 text-muted">
              Include the country code, or leave it blank.
            </Text>
          </View>

          {notice ? (
            <View
              className="mt-5 flex-row items-start gap-1.5"
              accessibilityLiveRegion="polite"
            >
              <View className="mt-0.5">
                <AlertCircle color={colors.danger} size={14} />
              </View>
              <Text
                variant="label"
                className="min-w-0 flex-1 font-medium text-danger"
              >
                {notice}
              </Text>
            </View>
          ) : null}

          <Button
            className="mt-6 min-h-12 w-full"
            onPress={() => void onSubmit()}
            disabled={saving || role === null}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : null}
            {/* The label stays put while it spins, so the control never looks
                like a different one. */}
            <Text>Continue</Text>
          </Button>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
