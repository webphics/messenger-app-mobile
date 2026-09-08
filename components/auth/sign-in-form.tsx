import { router } from "expo-router";
import { AlertCircle, Eye, EyeOff, MailCheck } from "@/components/icons";
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

import { SeedAccountPicker } from "@/components/auth/seed-account-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { GOOGLE_CONFIG } from "@/lib/google-config";
import { hapticSelection, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { ROLE_HREF } from "@/lib/hub-routes";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { magicLinkRequestNotice } from "@/lib/magic-link-route";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import { emailLooksValid } from "@/lib/email";
import type { SeedAccount } from "@/lib/seed-accounts";
import { colors, screenTopPad } from "@/lib/tokens";

/**
 * The only way into the app.
 *
 * There was a second screen beside this one — a registration form — and it
 * posted nowhere, because the API has no self-registration endpoint. An account
 * comes into existence one way on mobile: someone asks for a sign-in link and
 * verifies it. So the link below is not a convenience, it is the sign-up path,
 * and the copy where "create an account" used to link says so.
 */

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

/**
 * One field's validation message, in the shape every field on this screen uses.
 *
 * A live region rather than plain text, so a message that appears under a field
 * someone has already moved past is still announced.
 */
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View className="mt-1.5 flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
      <AlertCircle color={colors.danger} size={14} />
      <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
        {message}
      </Text>
    </View>
  );
}

export function SignInForm() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, signIn, signInWithGoogle, requestMagicLink } = useAuth();
  const submitting = state.status === "submitting";
  /**
   * Which of the two sign-in controls is waiting on something.
   *
   * One boolean per button would encode the same fact twice and let the two
   * disagree. The machine has one submitting state and cannot have two — a
   * second attempt of any kind must be refused while one is out — but the
   * spinner and the busy state both have to sit on the control that was
   * pressed, or the button someone did not touch is the one that reads as busy,
   * to the eye and to a screen reader alike.
   */
  const [pending, setPending] = useState<"password" | "google" | null>(null);
  /**
   * The sentence explaining why Google is not on offer, or null when it is. A
   * build with no OAuth client cannot sign anyone in with Google, and naming the
   * variable beats an enabled button that fails at the account sheet. Read once
   * at module load, so this never changes while the screen is up.
   */
  const googleUnavailable =
    GOOGLE_CONFIG.kind === "unconfigured" ? GOOGLE_CONFIG.notice : null;
  const passwordBusy = pending === "password";
  const googleBusy = pending === "google";
  /**
   * Read from `pending` as well as from the machine, because the two are not the
   * same interval. The Google account sheet is up before anything has been
   * submitted — deliberately, so dismissing it disturbs nothing — and no control
   * on this screen may be pressable while it is.
   */
  const busy = submitting || pending !== null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  /**
   * What to call the account a link would create.
   *
   * Not part of `LinkRequest`, because it is not something a request produced —
   * it is what someone typed, and it has to survive a refusal and a resend the
   * same way the address does.
   */
  const [name, setName] = useState("");
  const [linkRequest, setLinkRequest] = useState<LinkRequest>(NO_LINK_REQUEST);
  const sendingLink = linkRequest.sending;
  /**
   * Whether anything at all is out — the one guard every control on this screen
   * shares.
   *
   * The three requests are not independent even though only two of them touch
   * the machine. Asking for a link mid-sign-in writes to state on a screen that
   * is about to be replaced by a Hub; signing in mid-link-request lands a
   * confirmation on a screen nobody is looking at. And a control that accepts a
   * press it will drop is worse than one that says it is busy.
   *
   * Which control is *spinning* stays separate: that has to be the one that was
   * pressed, or the button someone did not touch reads as busy to the eye and to
   * a screen reader alike.
   */
  const anyRequestOut = busy || sendingLink;
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  /**
   * What the last attempt came back with — the server's own words for a refusal,
   * the two-factor explanation, or a network message. Cleared by the machine the
   * moment a new attempt starts. A failed link request outranks it: it is the
   * newer answer, and it describes the control that was pressed last.
   */
  const notice =
    linkRequest.failure !== null
      ? linkRequest.failure
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
    if (anyRequestOut) return;
    // Only the failure. It outranks the machine's notice, so left standing it
    // would outlive the attempt it described and speak over this one. A standing
    // confirmation is not cleared: a link did go to that address, and still has.
    setLinkRequest((prev) => ({ ...prev, failure: null }));

    const nextEmail = emailLooksValid(email.trim()) ? null : "Enter a valid email address";
    // Shape is not judged here. Refusing to send a password that fails today's
    // rules would lock out an older account that met the rules when it was
    // created — the server is the authority on what is valid.
    const nextPassword = password === "" ? "Enter your password" : null;
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    if (nextEmail || nextPassword) {
      hapticWarning();
      // Move to the first thing that is wrong: the errors below the fold are
      // otherwise invisible on a short screen with the keyboard up.
      (nextEmail ? emailRef : passwordRef).current?.focus();
      return;
    }

    setPending("password");
    try {
      await signIn(email.trim(), password);
    } finally {
      setPending(null);
    }
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
    if (anyRequestOut) return;

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

    const message = magicLinkRequestNotice(
      await requestMagicLink(trimmed, name),
    );
    if (message) {
      hapticWarning();
      setLinkRequest((prev) => ({ ...prev, sending: false, failure: message }));
      return;
    }

    hapticSuccess();
    setLinkRequest({ sentTo: trimmed, sending: false, failure: null });
  }

  /**
   * Hand off to Google, and let the machine decide what came back.
   *
   * Nothing typed is touched, on any path. A person who cancels the sheet or
   * whose sign-in fails still has the email and password they were part-way
   * through, so falling back to another method is not a retype.
   */
  async function onGoogleSignIn() {
    if (anyRequestOut) return;

    setPending("google");
    try {
      // Cleared afterwards rather than before, and only when there was an
      // attempt. A stale link failure outranks the machine's notice and would
      // speak over a Google error, so it cannot stay; but a dismissed sheet is
      // not an attempt, and clearing it then would make closing a sheet erase
      // something. The standing confirmation is never cleared either way — a
      // link did go to that address, and still has.
      if (await signInWithGoogle()) {
        setLinkRequest((prev) => ({ ...prev, failure: null }));
      }
    } finally {
      setPending(null);
    }
  }

  /**
   * Take a seed account's credentials into the form, and stop there.
   *
   * Not a sign-in: the fields fill, the person presses the same button as
   * everyone else, and the role they land in is whatever the server says that
   * account holds. See `components/auth/seed-account-picker`.
   */
  function onPickSeedAccount(account: SeedAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setEmailError(null);
    setPasswordError(null);
    // A confirmation names an address, and this one has just changed.
    setLinkRequest(NO_LINK_REQUEST);
    hapticSelection();
  }

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
            Welcome back
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            Sign in to access your queue and chats
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
            <FieldError message={emailError} />
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
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
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
            <FieldError message={passwordError} />
          </View>

          <SeedAccountPicker
            filled={{ email, password }}
            onSelect={onPickSeedAccount}
            // Inert while either request is out. Filling the form clears the
            // link request's state, and doing that mid-flight would take the
            // spinner off the button, drop the guard that stops a second
            // request, and land the confirmation on an address the form no
            // longer holds.
            disabled={anyRequestOut}
          />

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
            // Enabled until an attempt starts, then disabled with a spinner —
            // which is also the second half of the double-submit guard. "An
            // attempt" includes a Google sheet that is open, which the machine
            // cannot see.
            disabled={anyRequestOut}
            accessibilityState={{ disabled: anyRequestOut, busy: passwordBusy }}
          >
            {passwordBusy ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : null}
            {/* The label stays put while it spins, so the control never looks like a different one. */}
            <Text>Sign In</Text>
          </Button>

          <View className="mt-6 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text variant="label" className="text-muted">
              or
            </Text>
            <View className="h-px flex-1 bg-line" />
          </View>

          <View className="mt-4">
            <Text variant="label" className="mb-1.5 text-ink">
              Your Name <Text variant="label" className="text-muted">(optional)</Text>
            </Text>
            <Input
              className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
              placeholder="Jordan Ellis"
              accessibilityLabel="Your name, optional"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType="send"
              onSubmitEditing={() => void onRequestLink()}
              value={name}
              onChangeText={setName}
            />
            {/* No `FieldError` beneath it, and no validation behind it: there is
                no rule a name can fail, and inventing one here would be the only
                place on this screen that turned someone away over a preference. */}
          </View>

          {/* Deliberately not cleared when the name changes, unlike the address.
              The confirmation names where a link went, and editing a name does
              not move it. */}
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
            disabled={anyRequestOut}
            accessibilityState={{ disabled: anyRequestOut, busy: sendingLink }}
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

          {/* Where “Don’t have an account? Create one” used to link to a form that
              posted nowhere. Verifying a link is how an account is made, so the
              sentence names that rather than sending anyone looking for a screen
              that no longer exists. */}
          <Text variant="meta" className="mt-2.5 text-center text-muted">
            No account yet? No password needed — the link makes one when you open
            it, under the name above.
          </Text>

          {/*
            The promise the disabled button in 3a made, kept.

            It is still a real `disabled` button rather than something that
            merely looks like one when this build has no OAuth client
            configured — AGENTS.md's "if it looks clickable, it must be
            clickable" cuts both ways, and a control that is honestly shut beats
            one that fires nothing. What changed is that the reason is now a
            build problem rather than a roadmap, so it is named in a sentence
            underneath instead of hidden behind a "Soon" pill: the person who
            can fix it is the person who built it.
          */}
          <Button
            variant="outline"
            className="mt-3 min-h-12 w-full"
            onPress={() => void onGoogleSignIn()}
            // Disabled while any attempt is out, not only this one: the machine
            // refuses a second submit anyway, and a button that accepts a press
            // it will drop is worse than one that says it is busy.
            disabled={googleUnavailable !== null || anyRequestOut}
            accessibilityLabel={
              googleUnavailable
                ? "Continue with Google — not available in this build"
                : "Continue with Google"
            }
            accessibilityState={{
              disabled: googleUnavailable !== null || anyRequestOut,
              busy: googleBusy,
            }}
          >
            {googleBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
            {/* The label stays put while it spins, so the control never looks
                like a different one. */}
            <Text className="text-ink">Continue with Google</Text>
          </Button>

          {googleUnavailable ? (
            <Text variant="meta" className="mt-2 text-center text-muted">
              {googleUnavailable}
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
