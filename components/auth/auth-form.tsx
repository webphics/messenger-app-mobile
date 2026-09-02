import { router } from "expo-router";
import { AlertCircle, Eye, EyeOff, MailCheck, Sparkles } from "@/components/icons";
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
import { magicLinkRequestNotice } from "@/lib/magic-link-route";
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

/**
 * Where the request for a sign-in link has got to.
 *
 * Held here rather than in the auth state machine because asking for a link
 * establishes nothing and refuses nothing: nobody is signed in or out by it, and
 * the machine has no state that would be true while an email is in the post.
 *
 * Three fields rather than a union, because they genuinely vary independently: a
 * second link is in flight *while* the first one's confirmation still stands.
 * Collapsing them would take the confirmation off the screen for the length of
 * the resend and flip the button's label mid-spinner, so the control someone
 * just pressed would read as a different one exactly while it was busy.
 *
 * `sentTo` is the address that was *typed*, never anything the server said back,
 * because an answer that varied by whether the account existed is exactly what
 * this flow must not have.
 */
type LinkRequest = {
  /** The address the last confirmed link went to, or null when none has gone. */
  sentTo: string | null;
  sending: boolean;
  /** What went wrong last time, or null. */
  failure: string | null;
};

const NO_LINK_REQUEST: LinkRequest = { sentTo: null, sending: false, failure: null };

export function AuthForm({ mode }: AuthFormProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, signIn, requestMagicLink } = useAuth();
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
  const [linkRequest, setLinkRequest] = useState<LinkRequest>(NO_LINK_REQUEST);
  const sendingLink = linkRequest.sending;
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
  const notice =
    linkRequest.failure !== null
      ? linkRequest.failure
      : register
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
    // Only the failure. It outranks the machine's notice, so left standing it
    // would outlive the attempt it described and speak over this one. A standing
    // confirmation is not cleared: a link did go to that address, and still has.
    setLinkRequest((prev) => ({ ...prev, failure: null }));

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
      // The API has no self-registration endpoint — not disabled, absent — so
      // there is nothing to post these credentials at. Point at the one way an
      // account does come into existence on mobile, which is on this screen.
      hapticWarning();
      setLocalNotice(
        "Passwords can’t create an account here. Use “Email me a sign-in link” below — verifying your first link is what creates the account.",
      );
      return;
    }

    await signIn(email.trim(), password);
  }

  /**
   * Ask for a sign-in link, and say where it went.
   *
   * Deliberately says the same thing for every address. The API answers a
   * first-time email exactly as it answers a known one — verifying the link is
   * what creates the Customer account — and a screen that said "no account with
   * that email" would hand anyone who can type a way to find out who has one.
   */
  async function onRequestLink() {
    if (sendingLink) return;
    setLocalNotice(null);

    const trimmed = email.trim();
    if (!emailLooksValid(trimmed)) {
      setEmailError("Enter a valid email address");
      hapticWarning();
      emailRef.current?.focus();
      return;
    }

    setEmailError(null);
    // The standing confirmation is kept, not cleared: while a second link is on
    // its way the first one is still the true answer to "where did it go".
    setLinkRequest((prev) => ({ ...prev, sending: true, failure: null }));

    const message = magicLinkRequestNotice(await requestMagicLink(trimmed));
    if (message) {
      hapticWarning();
      setLinkRequest((prev) => ({ ...prev, sending: false, failure: message }));
      return;
    }

    hapticSuccess();
    setLinkRequest({ sentTo: trimmed, sending: false, failure: null });
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
                // A confirmation names an address. The moment that address stops
                // being the one in the field, it is describing somewhere else.
                setLinkRequest(NO_LINK_REQUEST);
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

          <View className="mt-6 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text variant="label" className="text-muted">
              or
            </Text>
            <View className="h-px flex-1 bg-line" />
          </View>

          {linkRequest.sentTo !== null ? (
            <View
              className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5"
              accessibilityLiveRegion="polite"
            >
              <View className="mt-0.5">
                <MailCheck color={colors.primary} size={16} />
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="label" className="text-ink">
                  Sign-in link sent
                </Text>
                {/* Names the address, and nothing else. The same sentence appears
                    whether or not that address has an account. */}
                <Text variant="meta" className="mt-1 text-muted">
                  Check{" "}
                  <Text variant="meta" className="font-semibold text-ink">
                    {linkRequest.sentTo}
                  </Text>
                  {" and open the link on this device. It expires shortly — ask for another if it does."}
                </Text>
              </View>
            </View>
          ) : null}

          <Button
            variant="outline"
            className="mt-4 min-h-12 w-full"
            onPress={() => void onRequestLink()}
            disabled={sendingLink}
            accessibilityState={{ disabled: sendingLink, busy: sendingLink }}
          >
            {sendingLink ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
            {/* Reads as a repeat once one has gone, so asking again is an obvious
                move rather than something that looks like starting over. */}
            <Text className="text-ink">
              {linkRequest.sentTo === null
                ? "Email me a sign-in link"
                : "Send another link"}
            </Text>
          </Button>

          <Text variant="meta" className="mt-2.5 text-center text-muted">
            No password needed. First time here? The link creates your account.
          </Text>
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
