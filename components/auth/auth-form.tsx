import { router } from "expo-router";
import { AlertCircle, Eye, EyeOff, Sparkles } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  View,
  type TextInput,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { hapticSelection, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { ROLE_HREF } from "@/lib/hub-routes";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import {
  emailLooksValid,
  passwordIsValid,
  passwordScore,
  suggestPassword,
} from "@/lib/password";
import { colors, screenTopPad } from "@/lib/tokens";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, signIn } = useAuth();
  const register = mode === "register";
  const submitting = state.status === "submitting";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const score = passwordScore(password);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  /**
   * What the last attempt came back with — the server's own words for a refusal,
   * the two-factor explanation, or a network message. Cleared by the machine the
   * moment a new attempt starts.
   *
   * The machine's notice is about *signing in*, so it is not shown on the sign-up
   * form: a refusal left over from a failed sign-in would otherwise greet someone
   * on an untouched registration form and outrank the explanation that form has
   * to give.
   */
  const notice = register
    ? localNotice
    : state.status === "signed-out"
      ? state.notice
      : null;

  // Navigating from the state rather than from the submit handler's return value
  // is what makes the destination the role the *server* assigned. Nothing on this
  // screen chooses it, and nothing on this screen can.
  useEffect(() => {
    if (state.status !== "signed-in") return;
    hapticSuccess();
    router.replace(ROLE_HREF[state.user.role]);
  }, [state]);

  async function onSubmit() {
    if (submitting) return;
    setLocalNotice(null);

    const nextEmail = emailLooksValid(email.trim()) ? null : "Enter a valid email address";
    // Only the sign-up form judges password shape. Refusing to send a password
    // that fails today's rules would lock out an older account that met the
    // rules when it was created — the server is the authority on what is valid.
    const nextPassword =
      register && !passwordIsValid(password)
        ? "8+ characters, with uppercase, lowercase, number & symbol"
        : password === ""
          ? "Enter your password"
          : null;
    const nextConfirm = register && confirm !== password ? "Passwords do not match" : null;
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    setConfirmError(nextConfirm);
    if (nextEmail || nextPassword || nextConfirm) {
      hapticWarning();
      // Move to the first thing that is wrong: the errors below the fold are
      // otherwise invisible on a short screen with the keyboard up.
      const firstError = nextEmail ? emailRef : nextPassword ? passwordRef : confirmRef;
      firstError.current?.focus();
      return;
    }

    if (register) {
      // The API has no self-registration endpoint — staff accounts are created by
      // an Admin, and a first-time email gets one by verifying a magic link. Say
      // so, rather than posting these credentials at a sign-in route that can only
      // answer "invalid email or password".
      hapticWarning();
      setLocalNotice(
        "Accounts aren’t created in the app. Ask an admin to invite you, then sign in here.",
      );
      return;
    }

    await signIn(email.trim(), password);
  }

  function onSuggest() {
    const next = suggestPassword();
    setPassword(next);
    setConfirm(next);
    setPasswordError(null);
    setConfirmError(null);
    hapticSelection();
  }

  const scoreLevel = score === "strong" ? 3 : score === "fair" ? 2 : score === "weak" ? 1 : 0;

  return (
    // Shrinking the scroll viewport is what keeps a focused field above the
    // Android IME; iOS does the same natively via automaticallyAdjustKeyboardInsets.
    // `contentRef` must sit on this node: `keyboardInset` is padding *inside* its
    // frame, so measuring it stays stable across repeat keyboardDidShow events
    // and reports a bottom the host has already resized when the host resizes.
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
          <Image
            source={require("../../assets/images/logo.png")}
            accessibilityLabel="Enki"
            className="mb-3 h-20 w-28"
            resizeMode="contain"
          />
          <Text variant="display" className="text-center text-ink">
            Enki
          </Text>
          <Text variant="meta" className="mt-1 text-center text-muted">
            Internal Support & Team Collaboration
          </Text>
        </Animated.View>

        <Animated.View
          entering={settleEnter(!!reduceMotion, 60)}
          className="mt-6 rounded-3xl border border-line/70 bg-surface p-5 shadow-md shadow-black/8"
        >
          <Text variant="headline" className="text-ink">
            {register ? "Create an account" : "Welcome back"}
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            {register
              ? "Sign up with your organization email"
              : "Sign in to access your queue and chats"}
          </Text>

          <View className="mt-5">
            <Text variant="label" className="mb-1.5 text-ink">
              Work Email
            </Text>
            <Input
              ref={emailRef}
              className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
              placeholder="name@company.com"
              accessibilityLabel="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              spellCheck={false}
              // Both, deliberately: Android reads autoComplete, iOS reads
              // textContentType, and without them a password manager has nothing
              // to offer against.
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setEmailError(null);
              }}
            />
            {emailError ? (
              <View
                className="mt-1.5 flex-row items-center gap-1.5"
                accessibilityLiveRegion="polite"
              >
                <AlertCircle color={colors.danger} size={14} />
                <Text variant="label" className="font-medium text-danger">
                  {emailError}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-4">
            <Text variant="label" className="mb-1.5 text-ink">
              Password
            </Text>
            <View className="relative justify-center">
              <Input
                ref={passwordRef}
                className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
                placeholder="••••••••"
                accessibilityLabel="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete={register ? "new-password" : "current-password"}
                textContentType={register ? "newPassword" : "password"}
                returnKeyType={register ? "next" : "go"}
                onSubmitEditing={() =>
                  register ? confirmRef.current?.focus() : void onSubmit()
                }
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setPasswordError(null);
                }}
              />
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 size-8 items-center justify-center rounded-full"
              >
                {showPassword ? (
                  <EyeOff color={colors.inkSoft} size={18} />
                ) : (
                  <Eye color={colors.muted} size={18} />
                )}
              </TactilePressable>
            </View>
            {passwordError ? (
              <View
                className="mt-1.5 flex-row items-center gap-1.5"
                accessibilityLiveRegion="polite"
              >
                <AlertCircle color={colors.danger} size={14} />
                <Text variant="label" className="font-medium text-danger">
                  {passwordError}
                </Text>
              </View>
            ) : null}
          </View>

          {register ? (
            <>
              {/* Visual Password Strength Indicator */}
              <View className="mt-3">
                <View className="flex-row items-center justify-between">
                  <Text variant="label" className="text-muted">
                    Password strength
                  </Text>
                  <Text
                    variant="label"
                    className={`font-bold ${
                      score === "strong"
                        ? "text-success"
                        : score === "fair"
                          ? "text-amber"
                          : score === "weak"
                            ? "text-danger"
                            : "text-muted"
                    }`}
                  >
                    {score === "empty" ? "Required" : score.toUpperCase()}
                  </Text>
                </View>
                <View className="mt-1.5 flex-row gap-1.5">
                  <View
                    className={`h-1.5 flex-1 rounded-full ${
                      scoreLevel >= 1
                        ? scoreLevel === 1
                          ? "bg-danger"
                          : scoreLevel === 2
                            ? "bg-amber"
                            : "bg-success"
                        : "bg-line"
                    }`}
                  />
                  <View
                    className={`h-1.5 flex-1 rounded-full ${
                      scoreLevel >= 2
                        ? scoreLevel === 2
                          ? "bg-amber"
                          : "bg-success"
                        : "bg-line"
                    }`}
                  />
                  <View
                    className={`h-1.5 flex-1 rounded-full ${
                      scoreLevel >= 3 ? "bg-success" : "bg-line"
                    }`}
                  />
                </View>
              </View>

              <View className="mt-4">
                <Text variant="label" className="mb-1.5 text-ink">
                  Confirm Password
                </Text>
                <View className="relative justify-center">
                  <Input
                    ref={confirmRef}
                    className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
                    placeholder="••••••••"
                    accessibilityLabel="Confirm password"
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={() => void onSubmit()}
                    value={confirm}
                    onChangeText={(v) => {
                      setConfirm(v);
                      setConfirmError(null);
                    }}
                  />
                  <TactilePressable
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => setShowConfirm((prev) => !prev)}
                    className="absolute right-3 size-8 items-center justify-center rounded-full"
                  >
                    {showConfirm ? (
                      <EyeOff color={colors.inkSoft} size={18} />
                    ) : (
                      <Eye color={colors.muted} size={18} />
                    )}
                  </TactilePressable>
                </View>
                {confirmError ? (
                  <View
                    className="mt-1.5 flex-row items-center gap-1.5"
                    accessibilityLiveRegion="polite"
                  >
                    <AlertCircle color={colors.danger} size={14} />
                    <Text variant="label" className="font-medium text-danger">
                      {confirmError}
                    </Text>
                  </View>
                ) : null}
              </View>

              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Suggest secure password"
                onPress={onSuggest}
                className="mt-3.5 flex-row items-center gap-1.5 self-start rounded-xl bg-primary-soft/70 px-3 py-1.5"
              >
                <Sparkles color={colors.primary} size={14} />
                <Text variant="label" className="font-bold text-primary">
                  Suggest strong password
                </Text>
              </TactilePressable>
            </>
          ) : null}

          {notice ? (
            <View
              className="mt-5 flex-row items-start gap-1.5"
              accessibilityLiveRegion="polite"
            >
              <View className="mt-0.5">
                <AlertCircle color={colors.danger} size={14} />
              </View>
              <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
                {notice}
              </Text>
            </View>
          ) : null}

          <Button
            className="mt-6 min-h-12 w-full"
            onPress={() => void onSubmit()}
            // Enabled until the request starts, then disabled with a spinner —
            // which is also the second half of the double-submit guard.
            disabled={submitting}
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : null}
            {/* The label stays put while it spins, so the control never looks like a different one. */}
            <Text>{register ? "Create Account" : "Sign In"}</Text>
          </Button>
        </Animated.View>

        <Animated.View entering={settleEnter(!!reduceMotion, 120)}>
          <TactilePressable
            accessibilityRole="link"
            onPress={() =>
              router.replace(register ? "/(auth)/sign-in" : "/(auth)/register")
            }
            className="mt-6 min-h-11 items-center justify-center"
          >
            <Text variant="meta" className="font-semibold text-primary">
              {register
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </Text>
          </TactilePressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
