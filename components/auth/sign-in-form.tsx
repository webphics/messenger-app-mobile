import { router } from "expo-router";
import {
  AlertCircle,
  ChevronLeft,
  Eye,
  EyeOff,
  MailCheck,
  Pencil,
} from "@/components/icons";
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
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { magicLinkRequestNotice } from "@/lib/magic-link-route";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import { signedInDestination } from "@/lib/onboarding-gate";
import {
  identifierError,
  normaliseIdentifier,
} from "@/lib/sign-in-identifier";
import {
  FIRST_STEP,
  STEP_COPY,
  type SignInStep,
  previousStep,
  showsIdentifierRow,
} from "@/lib/sign-in-steps";
import type { SeedAccount } from "@/lib/seed-accounts";
import { colors, screenTopPad } from "@/lib/tokens";

/**
 * The only way into the app, in the three steps the web client asks in
 * (`login-form.tsx`, `type LoginStep`).
 *
 * The identifier is asked for alone, and what follows it is a password or a
 * link — not a branch on who this is. Step one makes no request, because the
 * API refuses to say whether an account exists and a screen that asked would
 * need the oracle three separate defences exist to deny. See `lib/sign-in-steps`.
 *
 * There was a second screen beside this one — a registration form — and it
 * posted nowhere, because the API has no self-registration endpoint. An account
 * comes into existence one way on mobile: someone asks for a sign-in link and
 * verifies it. So the link below is not a convenience, it is the sign-up path.
 * What it no longer does is ask for a name on the way: a link-made account
 * arrives with none, and the onboarding gate asks for it once the session
 * exists, which is the one place that question is asked of every account
 * however it was made.
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
 *
 * `sentTo` is the identifier that was *typed*, never anything the server said
 * back, because an answer that varied by whether the account existed is exactly
 * what this flow must not have.
 */
type LinkRequest = {
  /** The identifier the last confirmed link went to, or null when none has gone. */
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
  const [step, setStep] = useState<SignInStep>(FIRST_STEP);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [identifierFieldError, setIdentifierFieldError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkRequest>(NO_LINK_REQUEST);
  /**
   * Whether the machine's standing notice still describes what is on screen.
   *
   * The machine clears its notice when a new attempt starts, which covers the
   * case of pressing the same button twice. It cannot cover the case of
   * *leaving*: a refusal for one identifier stayed on screen through a step
   * back and a different identifier being typed, still saying the password was
   * wrong for an account nobody had tried. The same reasoning `linkRequest`
   * already applies to its own failure — a message must not outlive the attempt
   * it described — and there is no event that would clear a notice the machine
   * owns, so it is suppressed here rather than cleared there.
   */
  const [noticeStale, setNoticeStale] = useState(false);
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
   */
  const anyRequestOut = busy || sendingLink;
  const identifierRef = useRef<TextInput>(null);
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
      : state.status === "signed-out" && !noticeStale
        ? state.notice
        : null;

  // Navigating from the state rather than from the submit handler's return value
  // is what makes the destination the role the *server* assigned. Nothing on this
  // screen chooses it, and nothing on this screen can — including the one case
  // where the destination is not a Hub at all: an account with no name is owed
  // onboarding first, whichever of the three ways in produced the session.
  useEffect(() => {
    if (state.status !== "signed-in") return;
    hapticSuccess();
    router.replace(signedInDestination(state.user));
  }, [state]);

  /**
   * Move to the field the new step opens on, once that field is mounted.
   *
   * Deferred because the control mounts in the render the step change causes, so
   * a focus call made alongside `setStep` is aimed at something that is not
   * there yet.
   */
  function focusAfterPaint(ref: React.RefObject<TextInput | null>) {
    requestAnimationFrame(() => ref.current?.focus());
  }

  function goBack() {
    const target = previousStep(step);
    if (target === null || anyRequestOut) return;

    setStep(target);
    setNoticeStale(true);
    // Only the failure. A standing confirmation is not cleared: a link did go to
    // that identifier, and still has.
    setLinkRequest((prev) => ({ ...prev, failure: null }));
    if (target === "identifier") focusAfterPaint(identifierRef);
  }

  /**
   * Step one: validate the identifier and advance. Deliberately nothing else.
   *
   * No request is made here and none may be. Whether this identifier belongs to
   * anybody is answered by the password attempt or by the link, never by this
   * screen — see `lib/sign-in-steps`.
   */
  function onIdentifierSubmit() {
    if (anyRequestOut) return;

    const next = identifierError(identifier);
    setIdentifierFieldError(next);
    if (next) {
      hapticWarning();
      identifierRef.current?.focus();
      return;
    }

    setStep("password");
    focusAfterPaint(passwordRef);
  }

  async function onSubmit() {
    if (anyRequestOut) return;
    // Only the failure. It outranks the machine's notice, so left standing it
    // would outlive the attempt it described and speak over this one.
    setLinkRequest((prev) => ({ ...prev, failure: null }));

    // Shape is not judged here. Refusing to send a password that fails today's
    // rules would lock out an older account that met the rules when it was
    // created — the server is the authority on what is valid.
    const nextPassword = password === "" ? "Enter your password" : null;
    setPasswordError(nextPassword);
    if (nextPassword) {
      hapticWarning();
      passwordRef.current?.focus();
      return;
    }

    setNoticeStale(false);
    setPending("password");
    try {
      await signIn(normaliseIdentifier(identifier), password);
    } finally {
      setPending(null);
    }
  }

  /**
   * Ask for a sign-in link, and say where it went.
   *
   * Deliberately says the same thing for every identifier. The API answers a
   * first-time address exactly as it answers a known one — verifying the link is
   * what creates the account — and a screen that said "no account with that
   * email" would hand anyone who can type a way to find out who has one. An
   * unknown *username* is answered identically and sends nothing, which is the
   * same refusal to enumerate seen from the other side.
   */
  async function onRequestLink() {
    if (anyRequestOut) return;

    const next = identifierError(identifier);
    if (next) {
      setIdentifierFieldError(next);
      hapticWarning();
      setStep("identifier");
      focusAfterPaint(identifierRef);
      return;
    }

    const sending = normaliseIdentifier(identifier);
    setIdentifierFieldError(null);
    setNoticeStale(false);
    // The standing confirmation is kept, not cleared: while a second link is on
    // its way the first one is still the true answer to "where did it go".
    setLinkRequest((prev) => ({ ...prev, sending: true, failure: null }));

    const message = magicLinkRequestNotice(await requestMagicLink(sending));
    if (message) {
      hapticWarning();
      setLinkRequest((prev) => ({ ...prev, sending: false, failure: message }));
      return;
    }

    hapticSuccess();
    setLinkRequest({ sentTo: sending, sending: false, failure: null });
    setStep("link-sent");
  }

  /**
   * Hand off to Google, and let the machine decide what came back.
   *
   * Nothing typed is touched, on any path. A person who cancels the sheet still
   * has what they were part-way through, so falling back to another method is
   * not a retype.
   */
  async function onGoogleSignIn() {
    if (anyRequestOut) return;

    setNoticeStale(false);
    setPending("google");
    try {
      // Cleared afterwards rather than before, and only when there was an
      // attempt. A stale link failure outranks the machine's notice and would
      // speak over a Google error, so it cannot stay; but a dismissed sheet is
      // not an attempt, and clearing it then would make closing a sheet erase
      // something.
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
   * account holds. It advances to the password step, because filling a password
   * on a step that does not show one would be a control writing somewhere
   * nobody can see.
   */
  function onPickSeedAccount(account: SeedAccount) {
    setIdentifier(account.email);
    setPassword(account.password);
    setIdentifierFieldError(null);
    setPasswordError(null);
    // A confirmation names an identifier, and this one has just changed.
    setLinkRequest(NO_LINK_REQUEST);
    setStep("password");
  }

  const heading = STEP_COPY[step];

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
            accessibilityLabel="JoyChat"
            className="mb-3 h-20 w-28"
            resizeMode="contain"
          />
          <Text variant="display" className="text-center text-ink">
            JoyChat
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
            {heading.title}
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            {heading.description}
          </Text>

          {/* The identifier, on the steps that no longer ask for it. The whole
              row is the way back, rather than a line of text with a separate
              control beside it. */}
          {showsIdentifierRow(step) ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`Signing in as ${identifier}. Change it.`}
              disabled={anyRequestOut}
              onPress={goBack}
              className="mt-4 flex-row items-center gap-2 rounded-2xl border border-line/70 bg-line/25 px-3.5 py-3"
            >
              <ChevronLeft color={colors.muted} size={16} />
              <Text
                variant="label"
                className="min-w-0 flex-1 text-ink"
                numberOfLines={1}
              >
                {identifier.trim()}
              </Text>
              <Pencil color={colors.muted} size={14} />
            </TactilePressable>
          ) : null}

          {step === "identifier" ? (
            <View className="mt-5">
              <Text variant="label" className="mb-1.5 text-ink">
                Username or email
              </Text>
              <Input
                ref={identifierRef}
                className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
                placeholder="name@company.com"
                accessibilityLabel="Username or email"
                autoCapitalize="none"
                // Not `email-address`: a username is as valid here as an
                // address, and that keyboard hides the layout somebody typing
                // one needs.
                keyboardType="default"
                autoCorrect={false}
                spellCheck={false}
                // Both, deliberately: Android reads autoComplete, iOS reads
                // textContentType, and without them a password manager has
                // nothing to offer against. `username` rather than `email`,
                // since either may be stored against this field.
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={onIdentifierSubmit}
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  setIdentifierFieldError(null);
                  setNoticeStale(true);
                  // A confirmation names an identifier. The moment that stops
                  // being the one in the field, it is describing somewhere else.
                  setLinkRequest(NO_LINK_REQUEST);
                }}
              />
              <FieldError message={identifierFieldError} />
            </View>
          ) : null}

          {step === "password" ? (
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
          ) : null}

          {/* Deliberately not cleared when the step changes. The confirmation
              names where a link went, and going back to look at the password
              does not move it. */}
          {step === "link-sent" && linkRequest.sentTo !== null ? (
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
                {/* Names the identifier, and nothing else. The same sentence
                    appears whether or not it has an account. */}
                <Text variant="meta" className="mt-1 text-muted">
                  Check the inbox for{" "}
                  <Text variant="meta" className="font-semibold text-ink">
                    {linkRequest.sentTo}
                  </Text>
                  {" and open the link on this device. It expires shortly — ask for another if it does."}
                </Text>
              </View>
            </View>
          ) : null}

          {step === "identifier" ? (
            <SeedAccountPicker
              filled={{ email: identifier, password }}
              onSelect={onPickSeedAccount}
              // Inert while either request is out. Filling the form clears the
              // link request's state, and doing that mid-flight would take the
              // spinner off the button and drop the guard that stops a second
              // request.
              disabled={anyRequestOut}
            />
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

          {step === "identifier" ? (
            <Button
              className="mt-6 min-h-12 w-full"
              onPress={onIdentifierSubmit}
              disabled={anyRequestOut}
              accessibilityState={{ disabled: anyRequestOut }}
            >
              <Text>Continue</Text>
            </Button>
          ) : null}

          {step === "password" ? (
            <Button
              className="mt-6 min-h-12 w-full"
              onPress={() => void onSubmit()}
              // Enabled until an attempt starts, then disabled with a spinner —
              // which is also the second half of the double-submit guard.
              disabled={anyRequestOut}
              accessibilityState={{ disabled: anyRequestOut, busy: passwordBusy }}
            >
              {passwordBusy ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : null}
              {/* The label stays put while it spins, so the control never looks like a different one. */}
              <Text>Sign In</Text>
            </Button>
          ) : null}

          {/* The link, on the two steps where an identifier has been settled on.
              Step one does not offer it: asking for a link is a request, and
              step one makes none. */}
          {step !== "identifier" ? (
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
              {/* Reads as a repeat once one has gone, so asking again is an
                  obvious move rather than something that looks like starting
                  over. */}
              <Text className="text-ink">
                {linkRequest.sentTo === null
                  ? "Email me a sign-in link"
                  : "Send another link"}
              </Text>
            </Button>
          ) : null}

          {step === "identifier" ? (
            <>
              <View className="mt-6 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-line" />
                <Text variant="label" className="text-muted">
                  or
                </Text>
                <View className="h-px flex-1 bg-line" />
              </View>

              {/*
                It is a real `disabled` button rather than something that merely
                looks like one when this build has no OAuth client configured —
                AGENTS.md's "if it looks clickable, it must be clickable" cuts
                both ways, and a control that is honestly shut beats one that
                fires nothing. The reason is a build problem, so it is named in a
                sentence underneath: the person who can fix it is the person who
                built it.
              */}
              <Button
                variant="outline"
                className="mt-4 min-h-12 w-full"
                onPress={() => void onGoogleSignIn()}
                // Disabled while any attempt is out, not only this one: the
                // machine refuses a second submit anyway, and a button that
                // accepts a press it will drop is worse than one that says it is
                // busy.
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
                <Text className="text-ink">Continue with Google</Text>
              </Button>

              {googleUnavailable ? (
                <Text variant="meta" className="mt-2 text-center text-muted">
                  {googleUnavailable}
                </Text>
              ) : null}

              {/* Where “Don’t have an account? Create one” used to link to a form
                  that posted nowhere. Verifying a link is how an account is
                  made, so the sentence names that rather than sending anyone
                  looking for a screen that no longer exists. */}
              <Text variant="meta" className="mt-4 text-center text-muted">
                No account yet? Continue with your email — the link makes one
                when you open it.
              </Text>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
