import * as AppleAuthentication from "expo-apple-authentication";
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
  type TextInputInstance,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SeedAccountPicker } from "@/components/auth/seed-account-picker";
import { TermsCheckbox } from "@/components/auth/terms-checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { isAppleSignInAvailable } from "@/lib/apple-session";
import { useAuth } from "@/lib/auth-context";
import { GOOGLE_CONFIG } from "@/lib/google-config";
import { GOOGLE_NATIVE_NOTICE } from "@/lib/google-session";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { magicLinkRequestNotice } from "@/lib/magic-link-route";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import { type AccountState, fetchAccountState } from "@/lib/account-state";
import {
  cacheAccountState,
  type CachedAccountState,
  readCachedAccountState,
} from "@/lib/account-state-cache";
import { OFFLINE_NOTICE } from "@/lib/auth-machine";
import { signedInDestination } from "@/lib/onboarding-gate";
import {
  identifierError,
  normaliseIdentifier,
} from "@/lib/sign-in-identifier";
import {
  CREDENTIALS_COPY,
  type CredentialsMode,
  FIRST_STEP,
  type LinkPurpose,
  STEP_COPY,
  type SignInStep,
  credentialsMode,
  previousStep,
  showsIdentifierRow,
  showsPasswordField,
  stepForAccount,
} from "@/lib/sign-in-steps";
import {
  SIGN_UP_FIELD_ORDER,
  type SignUpFieldErrors,
  type SignUpFields,
  signUpDefaults,
  signUpFieldErrors,
  signUpNeedsEmail,
  signUpTermsError,
} from "@/lib/sign-up-fields";
import type { SeedAccount } from "@/lib/seed-accounts";
import {
  CHALLENGE_COPY,
  codeError,
  type ChallengeMethod,
} from "@/lib/two-factor-challenge";
import { colors, screenTopPad } from "@/lib/tokens";

/** `brand-lockup.png` is 900x587; the mark sits above the wordmark. */
const BRAND_LOCKUP_ASPECT = 900 / 587;

/**
 * The only way into the app, in the steps the web client asks in
 * (`login-form.tsx`, `type LoginStep`).
 *
 * The identifier is asked for alone, and what follows it is whatever that
 * identifier actually needs: a password for an account that has one, the link
 * for an account that does not, and the sign-up step for an identifier nobody
 * holds yet.
 *
 * Step one asks the API which of those it is (`POST /auth/account-state`), and
 * it did not used to — this screen was written when the API refused to say
 * whether an account existed. `lib/account-state` records why that changed:
 * drawing the controls is itself the disclosure, so the choice was between
 * telling for free and telling under a budget. A failed probe stays on step one
 * rather than guessing which screen to draw.
 *
 * An account comes into existence one way on mobile: the sign-up step sends
 * `POST /auth/sign-up` with a name, a username and an optional phone, and
 * opening the link it mails creates the account with them. The onboarding gate
 * stays behind it for an account that still arrives without a name, such as one
 * made by an older build.
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

/**
 * The standing message over the form, above whichever controls are on display.
 *
 * A component rather than a block written twice, because the three steps and the
 * code entry both stand under one, and a refused code and a refused password
 * should not drift into looking like different kinds of news.
 */
function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View className="mt-5 flex-row items-start gap-1.5" accessibilityLiveRegion="polite">
      <View className="mt-0.5">
        <AlertCircle color={colors.danger} size={14} />
      </View>
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
  const {
    state,
    signIn,
    signInWithGoogle,
    signInWithApple,
    requestMagicLink,
    requestSignUp,
    submitTwoFactorCode,
    cancelTwoFactor,
  } = useAuth();
  const submitting = state.status === "submitting";
  /**
   * The challenge, when the machine is in one.
   *
   * Read off `state.status` rather than held as a fourth `SignInStep`, and
   * deliberately not a route: a half-finished handshake with a held credential
   * that only makes sense mid-flow must not be an address anyone can reach out
   * of order. See
   * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`. The
   * three steps below are untouched by it. An account without a second factor
   * never sees this branch at all.
   */
  const challenge = state.status === "two-factor" ? state : null;
  const verifying = challenge?.verifying ?? false;
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
  const [pending, setPending] = useState<"password" | "google" | "apple" | null>(null);
  /**
   * The sentence explaining why Google is not on offer, or null when it is. A
   * build with no OAuth client cannot sign anyone in with Google, and naming the
   * variable beats an enabled button that fails at the account sheet. The same
   * goes for a binary without the native module, such as Expo Go. Read once at
   * module load, so this never changes while the screen is up.
   */
  const googleUnavailable =
    GOOGLE_CONFIG.kind === "unconfigured" ? GOOGLE_CONFIG.notice : GOOGLE_NATIVE_NOTICE;
  const passwordBusy = pending === "password";
  const googleBusy = pending === "google";
  const appleBusy = pending === "apple";
  /**
   * Whether to offer Sign in with Apple: iOS with a binary that has the native
   * module. Unlike Google there is no sentence for the build that cannot — the
   * button is simply not drawn, since Android never offers it and App Review
   * only asks it of iOS. Asked once; the answer cannot change while the app runs.
   */
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void isAppleSignInAvailable().then((available) => {
      if (live) setAppleAvailable(available);
    });
    return () => {
      live = false;
    };
  }, []);
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
  /** Which request the standing link came from, so a resend and Back repeat it. */
  const [linkPurpose, setLinkPurpose] = useState<LinkPurpose>("sign-in");
  /**
   * The sign-up step's fields, and the identifier they were opened for. Kept
   * across a step back so a typo fixed on step one does not cost what was typed
   * here, and reset when step one names someone else.
   */
  const [signUp, setSignUp] = useState<{ for: string; fields: SignUpFields }>({
    for: "",
    fields: signUpDefaults(""),
  });
  const [signUpErrors, setSignUpErrors] = useState<SignUpFieldErrors>({});
  /**
   * The Terms of Use box. Required: the link is not sent until it is ticked,
   * and the API records the date when the account is created from the link.
   */
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
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
  /** What step two is about, once the probe has said. Null until it has. */
  const [credentials, setCredentials] = useState<CredentialsMode | null>(null);
  /** The one answer this screen holds, so going back and returning is free. */
  const [accountCache, setAccountCache] = useState<CachedAccountState | null>(null);
  const [probing, setProbing] = useState(false);
  /**
   * Why the probe could not answer. Its own field rather than the machine's
   * notice: nobody was signed in or refused by it, and it describes the control
   * that was pressed last.
   */
  const [probeFailure, setProbeFailure] = useState<string | null>(null);
  /** The code being typed, and why it cannot be sent yet. */
  const [code, setCode] = useState("");
  const [codeFieldError, setCodeFieldError] = useState<string | null>(null);
  /**
   * Which kind of code the field is asking for. The authenticator first, since
   * that is the everyday answer; a backup code is the way in for somebody
   * without it, one tap away rather than behind a screen of its own.
   */
  const [codeMethod, setCodeMethod] = useState<ChallengeMethod>("totp");
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
  const anyRequestOut = busy || sendingLink || probing || verifying;
  const identifierRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const codeRef = useRef<TextInputInstance>(null);
  const signUpRefs = {
    name: useRef<TextInputInstance>(null),
    username: useRef<TextInputInstance>(null),
    email: useRef<TextInputInstance>(null),
    phone: useRef<TextInputInstance>(null),
  };
  /**
   * What the last attempt came back with — the server's own words for a refusal,
   * the two-factor explanation, or a network message. Cleared by the machine the
   * moment a new attempt starts. A failed link request outranks it: it is the
   * newer answer, and it describes the control that was pressed last.
   */
  const notice = challenge
    ? // The challenge carries its own, and nothing from before it can still be
      // true: the identifier was accepted and the password was too, so a probe
      // failure or a link error standing here would describe a step that has
      // already succeeded.
      challenge.notice
    : probeFailure !== null
      ? probeFailure
      : linkRequest.failure !== null
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
   * Open on the code field when the challenge arrives, and leave nothing typed
   * in it behind when the challenge goes.
   *
   * Keyed on whether there is a challenge rather than on which one, so a refused
   * code leaves the field alone. Somebody correcting a typo should not find it
   * emptied under them.
   *
   * Every way *out* clears the code and the password both, which is the half of
   * "nothing about the attempt retained" that lives on this screen rather than
   * in the machine. The password especially: it was accepted a moment ago, so a
   * cancelled challenge that left it sitting in a field would be the abandoned
   * attempt somebody else holding the phone could finish. The identifier stays,
   * because it is not a secret and it is what the row above offers as the way
   * back.
   */
  const inChallenge = challenge !== null;
  useEffect(() => {
    if (inChallenge) {
      focusAfterPaint(codeRef);
      return;
    }

    // Synchronising with a value this component does not own: the challenge is
    // the machine's state, and it ends in ways no handler here sees — a code
    // accepted, a cookie expired, the machine reset — so the discard cannot be
    // hung off the cancel button. It cascades once, on a transition that
    // re-renders the screen anyway, and the effect does not re-run because
    // `inChallenge` is already false when it does.
    //
    // Deleting the suppression means giving these four their own component,
    // mounted with the challenge, so that leaving unmounts them. Worth doing;
    // it is a component split rather than a change to this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode("");
    setCodeFieldError(null);
    setCodeMethod("totp");
    setPassword("");
    setShowPassword(false);
  }, [inChallenge]);

  /**
   * Move to the field the new step opens on, once that field is mounted.
   *
   * Deferred because the control mounts in the render the step change causes, so
   * a focus call made alongside `setStep` is aimed at something that is not
   * there yet.
   */
  function focusAfterPaint(ref: React.RefObject<TextInputInstance | null>) {
    requestAnimationFrame(() => ref.current?.focus());
  }

  function goBack() {
    const target = previousStep(step, linkPurpose);
    if (target === null || anyRequestOut) return;

    setStep(target);
    setNoticeStale(true);
    // Only the failure. A standing confirmation is not cleared: a link did go to
    // that identifier, and still has.
    setLinkRequest((prev) => ({ ...prev, failure: null }));
    if (target === "identifier") focusAfterPaint(identifierRef);
  }

  /**
   * Step one: validate the identifier, then ask what it needs.
   *
   * It used to advance on the validation alone, because the API refused to say
   * whether an account existed. `POST /auth/account-state` now answers that
   * deliberately — see `lib/account-state` for why the API conceded it — so
   * step two can draw a password field only for an account that has one.
   *
   * A cached answer is used rather than asked for again, which is what makes
   * fixing a typo and coming back free against a budget the API keeps per
   * identifier.
   */
  async function onIdentifierSubmit() {
    if (anyRequestOut) return;

    const next = identifierError(identifier);
    setIdentifierFieldError(next);
    if (next) {
      hapticWarning();
      identifierRef.current?.focus();
      return;
    }

    setNoticeStale(false);
    setProbeFailure(null);

    const sending = normaliseIdentifier(identifier);
    const known = readCachedAccountState(accountCache, sending, Date.now());
    if (known) {
      enterStepFor(known);
      return;
    }

    setProbing(true);
    try {
      const result = await fetchAccountState(sending);
      if (!result.ok) {
        // Stay where we are. Advancing on a failed probe means picking one of
        // the two step-two screens without knowing which is right, and picking
        // the link-only one would hide the password field from somebody who has
        // a password and blame their account for it.
        hapticWarning();
        setProbeFailure(
          result.failure.kind === "refused"
            ? result.failure.message
            : result.failure.kind === "unreachable"
              ? OFFLINE_NOTICE
              : "The server sent something this app could not read.",
        );
        return;
      }

      setAccountCache(cacheAccountState(sending, result.value, Date.now()));
      enterStepFor(result.value);
    } finally {
      setProbing(false);
    }
  }

  /** Move to step two knowing what it has to draw, and open on the right field. */
  function enterStepFor(state: AccountState) {
    if (stepForAccount(state) === "sign-up") {
      const typed = normaliseIdentifier(identifier);
      if (signUp.for !== typed) {
        setSignUp({ for: typed, fields: signUpDefaults(identifier) });
        setSignUpErrors({});
      }
      setStep("sign-up");
      focusAfterPaint(signUpRefs.name);
      return;
    }

    const mode = credentialsMode(state);
    setCredentials(mode);
    setStep("credentials");
    if (showsPasswordField(mode)) focusAfterPaint(passwordRef);
  }

  function setSignUpField(field: keyof SignUpFields, value: string) {
    setSignUp((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }));
    setSignUpErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  /**
   * Ask for a sign-up link: the name, username and phone travel with it, and
   * opening it creates the account with them.
   *
   * Unlike a sign-in link this one is allowed to say a username or an address is
   * taken, and says so on the field it is about. An address can only be taken
   * here if someone signed up with it after step one checked, so the cached
   * answer for it is dropped and the row above is the way back to sign in.
   */
  async function onRequestSignUp() {
    if (anyRequestOut) return;

    const needsEmail = signUpNeedsEmail(identifier);
    const fields = needsEmail
      ? signUp.fields
      : { ...signUp.fields, email: normaliseIdentifier(identifier) };
    const errors = signUpFieldErrors(fields);
    setSignUpErrors(errors);
    const termsProblem = signUpTermsError(termsAccepted);
    setTermsError(termsProblem);

    const firstError = SIGN_UP_FIELD_ORDER.find((field) => errors[field]);
    if (firstError) {
      hapticWarning();
      signUpRefs[firstError].current?.focus();
      return;
    }
    if (termsProblem) {
      hapticWarning();
      return;
    }

    setNoticeStale(false);
    setLinkRequest((prev) => ({ ...prev, sending: true, failure: null }));

    const outcome = await requestSignUp({ ...fields, acceptTerms: true });
    if (outcome.kind === "sent") {
      hapticSuccess();
      setLinkPurpose("sign-up");
      setLinkRequest({ sentTo: fields.email.trim().toLowerCase(), sending: false, failure: null });
      setStep("link-sent");
      return;
    }

    hapticWarning();

    if (outcome.kind === "username-taken") {
      setLinkRequest((prev) => ({ ...prev, sending: false }));
      setSignUpErrors({ username: outcome.message });
      if (step === "sign-up") signUpRefs.username.current?.focus();
      else setStep("sign-up");
      return;
    }

    if (outcome.kind === "email-taken" && needsEmail) {
      setLinkRequest((prev) => ({ ...prev, sending: false }));
      setSignUpErrors({ email: outcome.message });
      if (step === "sign-up") signUpRefs.email.current?.focus();
      else setStep("sign-up");
      return;
    }

    if (outcome.kind === "email-taken") setAccountCache(null);

    setLinkRequest((prev) => ({
      ...prev,
      sending: false,
      failure: outcome.kind === "transport-failure" ? OFFLINE_NOTICE : outcome.message,
    }));
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
    setLinkPurpose("sign-in");
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

  /** `onGoogleSignIn` with Apple's sheet, on exactly the same terms. */
  async function onAppleSignIn() {
    if (anyRequestOut) return;

    setNoticeStale(false);
    setPending("apple");
    try {
      if (await signInWithApple()) {
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
    setProbeFailure(null);
    // A seed account has a password by construction — that is what the picker
    // filled in — so step two is asked for it without spending a probe.
    enterStepFor({ exists: true, hasPassword: true });
  }

  /**
   * Send the code, having refused to send one that could only come back refused.
   *
   * The one place this screen judges shape where the password field deliberately
   * does not. `lib/two-factor-challenge` says why. The challenge itself is not
   * passed: it lives in the machine state, and a screen that had to hand it back
   * could hand back the wrong one.
   */
  async function onSubmitCode() {
    if (anyRequestOut || challenge === null) return;

    const next = codeError(code, codeMethod);
    setCodeFieldError(next);
    if (next) {
      hapticWarning();
      codeRef.current?.focus();
      return;
    }

    await submitTwoFactorCode(code, codeMethod);
  }

  /**
   * Ask for the other kind of code.
   *
   * What was typed goes, because it was typed for the other field: six digits
   * are never a backup code and a backup code is never six digits, so carrying
   * either across is a refusal waiting to happen. The challenge is untouched,
   * since both kinds answer the same one.
   */
  function onSwitchCodeMethod() {
    if (anyRequestOut) return;
    setCodeMethod((current) => (current === "totp" ? "backup-code" : "totp"));
    setCode("");
    setCodeFieldError(null);
    focusAfterPaint(codeRef);
  }

  /**
   * Back out of the challenge, to a sign-in screen with nothing standing on it.
   *
   * There is no step behind this one to return to. The challenge is not a step,
   * so it does not go through `goBack`. Everything it leaves behind is
   * discarded by the machine and by the effect above, the challenge cookie
   * included.
   */
  function onCancelChallenge() {
    if (anyRequestOut) return;
    cancelTwoFactor();
  }

  const challengeCopy = CHALLENGE_COPY[codeMethod];
  const heading = challenge
    ? challengeCopy
    : step === "credentials"
      ? CREDENTIALS_COPY[credentials ?? "password"]
      : step === "link-sent" && linkPurpose === "sign-up"
        ? STEP_COPY["sign-up-link-sent"]
        : STEP_COPY[step];
  const signUpNeedsEmailField = signUpNeedsEmail(identifier);

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
          {/* The delivered stacked lockup, as one image: the wordmark's R is a
              drawn glyph rather than a letter in any font, so the name is never
              typeset beside the mark. */}
          <Image
            source={require("../../assets/images/brand-lockup.png")}
            accessibilityRole="image"
            accessibilityLabel="ChatRoute"
            style={{ width: 176, height: 176 / BRAND_LOCKUP_ASPECT }}
            resizeMode="contain"
          />
          <Text variant="meta" className="mt-3 text-center text-muted">
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

          {challenge ? (
            <>
              {/*
                One field, for whichever kind of code the switch below it names.
                Both are redeemed against the same challenge, so changing kind
                is a change of field rather than of step.
              */}
              <View className="mt-5">
                <Text variant="label" className="mb-1.5 text-ink">
                  {challengeCopy.fieldLabel}
                </Text>
                {codeMethod === "totp" ? (
                  <Input
                    key="totp"
                    ref={codeRef}
                    className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base tracking-[6px] text-ink"
                    placeholder={challengeCopy.placeholder}
                    accessibilityLabel={challengeCopy.fieldAccessibilityLabel}
                    // The one-time-code hint is what makes an authenticator's own
                    // suggestion appear over the keyboard, on both platforms.
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    inputMode="numeric"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    // Long enough to hold a pasted `123 456`, which is normalised
                    // rather than refused. Nothing here blocks a paste.
                    maxLength={16}
                    returnKeyType="go"
                    onSubmitEditing={() => void onSubmitCode()}
                    value={code}
                    onChangeText={(v) => {
                      setCode(v);
                      setCodeFieldError(null);
                    }}
                  />
                ) : (
                  <Input
                    // Keyed apart from the field above so the keyboard type
                    // changes with it: a number pad cannot type a backup code.
                    key="backup-code"
                    ref={codeRef}
                    className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base tracking-[2px] text-ink"
                    placeholder={challengeCopy.placeholder}
                    accessibilityLabel={challengeCopy.fieldAccessibilityLabel}
                    // Not a one-time code to the platform: no app will ever
                    // suggest one, and the hint would invite an SMS code instead.
                    autoComplete="off"
                    keyboardType="default"
                    // Mixed case, compared exactly by the API, so the keyboard
                    // must not change a letter somebody typed.
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    maxLength={24}
                    returnKeyType="go"
                    onSubmitEditing={() => void onSubmitCode()}
                    value={code}
                    onChangeText={(v) => {
                      setCode(v);
                      setCodeFieldError(null);
                    }}
                  />
                )}
                <FieldError message={codeFieldError} />
              </View>

              <FormNotice message={notice} />

              <Button
                className="mt-6 min-h-12 w-full"
                onPress={() => void onSubmitCode()}
                disabled={anyRequestOut}
                accessibilityState={{ disabled: anyRequestOut, busy: verifying }}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : null}
                {/* The label stays put while it spins, as on the password step. */}
                <Text>Verify</Text>
              </Button>

              {/* The way in for somebody without their authenticator, and back
                  again. Drawn as text rather than as a third button, because it
                  changes the field rather than doing anything. */}
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={challengeCopy.switchLabel}
                accessibilityState={{ disabled: anyRequestOut }}
                disabled={anyRequestOut}
                onPress={onSwitchCodeMethod}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                className="mt-4 min-h-11 items-center justify-center self-center px-2"
              >
                <Text variant="label" className="text-primary">
                  {challengeCopy.switchLabel}
                </Text>
              </TactilePressable>

              {/* No dead end: there is always a way back to the sign-in screen,
                  and taking it keeps nothing of the attempt. */}
              <Button
                variant="outline"
                className="mt-4 min-h-12 w-full"
                onPress={onCancelChallenge}
                disabled={anyRequestOut}
                accessibilityLabel="Cancel and go back to sign in"
                accessibilityState={{ disabled: anyRequestOut }}
              >
                <ChevronLeft color={colors.muted} size={16} />
                <Text className="text-ink">Back to sign in</Text>
              </Button>
            </>
          ) : (
            <>
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
                onSubmitEditing={() => void onIdentifierSubmit()}
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  setIdentifierFieldError(null);
                  setNoticeStale(true);
                  setProbeFailure(null);
                  // A confirmation names an identifier. The moment that stops
                  // being the one in the field, it is describing somewhere else.
                  setLinkRequest(NO_LINK_REQUEST);
                }}
              />
              <FieldError message={identifierFieldError} />
            </View>
          ) : null}

          {step === "credentials" && showsPasswordField(credentials ?? "password") ? (
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

          {step === "sign-up" ? (
            <>
              <View className="mt-5">
                <Text variant="label" className="mb-1.5 text-ink">
                  Full name
                </Text>
                <Input
                  ref={signUpRefs.name}
                  className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
                  placeholder="Jordan Ellis"
                  accessibilityLabel="Full name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => signUpRefs.username.current?.focus()}
                  value={signUp.fields.name}
                  onChangeText={(v) => setSignUpField("name", v)}
                />
                <FieldError message={signUpErrors.name ?? null} />
              </View>

              <View className="mt-4">
                <Text variant="label" className="mb-1.5 text-ink">
                  Username
                </Text>
                <Input
                  ref={signUpRefs.username}
                  className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
                  placeholder="jordan_e"
                  accessibilityLabel="Username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="username-new"
                  textContentType="username"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() =>
                    (signUpNeedsEmailField ? signUpRefs.email : signUpRefs.phone).current?.focus()
                  }
                  value={signUp.fields.username}
                  onChangeText={(v) => setSignUpField("username", v)}
                />
                <Text variant="meta" className="mt-1.5 text-muted">
                  1 to 20 letters, numbers or underscores.
                </Text>
                <FieldError message={signUpErrors.username ?? null} />
              </View>

              {/* Asked for only when step one was a username: an address typed
                  there is already in the row above. */}
              {signUpNeedsEmailField ? (
                <View className="mt-4">
                  <Text variant="label" className="mb-1.5 text-ink">
                    Email
                  </Text>
                  <Input
                    ref={signUpRefs.email}
                    className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
                    placeholder="name@company.com"
                    accessibilityLabel="Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => signUpRefs.phone.current?.focus()}
                    value={signUp.fields.email}
                    onChangeText={(v) => setSignUpField("email", v)}
                  />
                  <FieldError message={signUpErrors.email ?? null} />
                </View>
              ) : null}

              <View className="mt-4">
                <Text variant="label" className="mb-1.5 text-ink">
                  Phone{" "}
                  <Text variant="label" className="text-muted">
                    (optional)
                  </Text>
                </Text>
                <Input
                  ref={signUpRefs.phone}
                  className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
                  placeholder="+8801712345678"
                  accessibilityLabel="Phone number, optional"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="go"
                  onSubmitEditing={() => void onRequestSignUp()}
                  value={signUp.fields.phone}
                  onChangeText={(v) => setSignUpField("phone", v)}
                />
                <Text variant="meta" className="mt-1.5 text-muted">
                  Include the country code, or leave it blank.
                </Text>
                <FieldError message={signUpErrors.phone ?? null} />
              </View>
            </>
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
                  {linkPurpose === "sign-up" ? "Sign-up link sent" : "Sign-in link sent"}
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

          <FormNotice message={notice} />

          {step === "identifier" ? (
            <Button
              className="mt-6 min-h-12 w-full"
              onPress={() => void onIdentifierSubmit()}
              disabled={anyRequestOut}
              accessibilityState={{ disabled: anyRequestOut }}
            >
              <Text>Continue</Text>
            </Button>
          ) : null}

          {step === "credentials" && showsPasswordField(credentials ?? "password") ? (
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

          {step === "sign-up" ? (
            <TermsCheckbox
              checked={termsAccepted}
              onChange={(next) => {
                setTermsAccepted(next);
                setTermsError(null);
              }}
              error={termsError}
              disabled={anyRequestOut}
            />
          ) : null}

          {step === "sign-up" ? (
            <Button
              className="mt-6 min-h-12 w-full"
              onPress={() => void onRequestSignUp()}
              disabled={anyRequestOut}
              accessibilityState={{ disabled: anyRequestOut, busy: sendingLink }}
            >
              {sendingLink ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : null}
              <Text>Email me a sign-up link</Text>
            </Button>
          ) : null}

          {/* The link, on the steps where an identifier has been settled on and
              its account found, and again once it has gone. Step one does not
              offer it: asking for a link is a request, and step one makes none.
              A resend after a sign-up repeats the sign-up. */}
          {step === "credentials" || step === "link-sent" ? (
            <Button
              variant="outline"
              className="mt-4 min-h-12 w-full"
              onPress={() =>
                void (step === "link-sent" && linkPurpose === "sign-up"
                  ? onRequestSignUp()
                  : onRequestLink())
              }
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

              {/*
                Apple's own control, because the guidelines App Review holds a
                Sign in with Apple button to — its logo, title, colours and
                proportions — are met by the system button and by nothing drawn
                here. The white outline sits beside the outline Google button at
                the same height and radius, so neither reads as the lesser
                option. It has no disabled state, so the wrapper takes the
                presses while another attempt is out, and the spinner is laid
                over it rather than inside.
              */}
              {appleAvailable ? (
                <View
                  className="mt-3 w-full justify-center"
                  pointerEvents={anyRequestOut ? "none" : "auto"}
                  style={{ opacity: anyRequestOut && !appleBusy ? 0.5 : 1 }}
                  accessibilityState={{ disabled: anyRequestOut, busy: appleBusy }}
                >
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
                    cornerRadius={12}
                    style={{ width: "100%", height: 48 }}
                    onPress={() => void onAppleSignIn()}
                  />
                  {appleBusy ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      className="absolute right-4"
                    />
                  ) : null}
                </View>
              ) : null}

              {/* An identifier nobody holds goes to the sign-up step, so there is
                  no separate screen to link to. */}
              <Text variant="meta" className="mt-4 text-center text-muted">
                No account yet? Continue with your email and we will set one up.
              </Text>
            </>
          ) : null}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
