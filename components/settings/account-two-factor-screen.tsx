import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  View,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
} from "@/components/icons";
import { ForgotPasswordLink } from "@/components/auth/forgot-password-link";
import { InScreenHeader } from "@/components/in-screen-header";
import { SetupQrCode } from "@/components/settings/setup-qr-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import type { ApiFailure } from "@/lib/api-result";
import { useAuth } from "@/lib/auth-context";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { colors, screenBottomPad } from "@/lib/tokens";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  generateBackupCodes,
  startTwoFactorSetup,
  type TwoFactorSetup,
} from "@/lib/two-factor-api";
import { codeError } from "@/lib/two-factor-challenge";
import {
  BACKUP_CODES_COPY,
  TWO_FACTOR_COPY,
  TWO_FACTOR_DISABLE_CONFIRMATION,
  TWO_FACTOR_PASSWORD_COPY,
  TWO_FACTOR_SETUP_COPY,
  asksForPassword,
  checkTwoFactorPassword,
  disableConfirmationMessage,
  groupSetupKey,
  twoFactorActions,
  twoFactorStatus,
  type TwoFactorActionKind,
} from "@/lib/two-factor-management";

/**
 * Whether two-factor is on for this account, how to turn it off, and how to
 * replace the backup codes.
 *
 * Pushed from the account card on Settings and living outside the three role
 * groups, per ADR-0012: governing your own account belongs to the account rather
 * than to the role, so nothing here reads one.
 *
 * ## Turning it on is a setup, drawn on this screen
 *
 * With two-factor off the one control is turning it on (ticket 08), and it
 * opens a setup card in place rather than a screen: the key for the
 * authenticator app (a link that opens one on this phone, a QR code for one on
 * another, and the key as text), the backup codes, and the code that proves the app has the
 * key. Only that last step turns anything on, which is better-auth's rule and
 * not this screen's, so a person who cancels or walks away is left with
 * two-factor off and nothing to undo. The codes are shown before the code field
 * for the reason `TWO_FACTOR_SETUP_COPY` gives.
 *
 * It was withheld while `POST /auth/two-factor/verify-backup-code` carried
 * `@UseGuards(AuthGuard)`, because then a backup code could not be redeemed at
 * sign-in and turning on the factor would have thrown away the only spare key.
 * The API dropped the guard and the sign-in challenge takes a backup code now;
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`
 * has the run that showed it. The rules live in `lib/two-factor-management`,
 * so this file draws what it is handed.
 *
 * ## Where the state comes from, and why nothing is fetched
 *
 * `twoFactorEnabled` is on `SessionUser`, parsed at sign-in and carried since,
 * so this screen reports it rather than asking for it. There is no read to fail
 * here, which is why the only failures below are about actions. The state is
 * read live rather than frozen on the way in, which is the opposite of
 * `components/settings/account-password-screen` and deliberately so: turning the
 * factor off is exactly the change somebody is standing here to make, and a
 * screen that went on saying "on" afterwards would be the bug ticket 07 names.
 *
 * ## What happens to the signed-in person after a disable or a setup
 *
 * `lib/two-factor-api` brings the module mirror and the Kept person into line,
 * and this hands the answer to `accountUpdated` so the auth state agrees with
 * both. Without that last step the two-factor row on Settings goes on reporting
 * the factor as it was, until the app is restarted. See `lib/auth-context`.
 *
 * ## Why the codes are shown here and nowhere else
 *
 * The API answers with them in one response and no route reads them back, so
 * this screen is the only place they will ever exist. They are held in state for
 * as long as somebody is standing here, never written to the Store, and the
 * warning arrives with them rather than after them.
 */

/**
 * One sentence for an action that did not happen.
 *
 * `components/settings/account-sessions-screen`'s shape and the same four cases,
 * because a person answers each of them differently and ticket 07 asks that a
 * failure read differently from a refusal. A refusal speaks in the API's own
 * words, which here is usually the one sentence that matters, that the password
 * was wrong. An expired session says nothing, for the reason it says nothing
 * anywhere else: the auth layer is already on its way to sign-in, and a line
 * about two-factor would arrive on a screen that is leaving.
 *
 * The malformed wording differs between the actions because the risk does.
 * Starting a setup turns nothing on, so whatever it could not read leaves
 * two-factor off, and the message can say so.
 * A disable this client could not read may or may not have happened. A generate
 * that could not be read may well have replaced the codes anyway, since the API
 * writes the new set before it answers, so somebody has to be told that the
 * codes they already hold may be dead.
 */
function actionRefusal(
  kind: TwoFactorActionKind,
  failure: ApiFailure,
): string {
  switch (failure.kind) {
    case "unreachable":
      return kind === "disable"
        ? "Could not reach the server, so two-factor is still on. Check your connection and try again."
        : kind === "enable"
          ? "Could not reach the server, so two-factor is still off. Check your connection and try again."
          : "Could not reach the server, so your backup codes have not changed. Check your connection and try again.";
    case "refused":
      return failure.message;
    case "malformed":
      return kind === "disable"
        ? "The server answered with something this app did not understand. Two-factor may not have been turned off."
        : kind === "enable"
          ? "The server answered with something this app did not understand, so setup cannot go on. Two-factor is still off. Try again."
          : "The server answered with something this app did not understand, so no codes can be shown. The codes you had before may already have been replaced, so try again and store the ones that come back.";
    case "unauthorised":
      return "";
  }
}

/**
 * One sentence for a setup code that did not turn the factor on.
 *
 * Its own function rather than a fourth action, because the setup card draws
 * its failure under its own field. A malformed answer is the one that cannot
 * promise anything: the API may well have turned the factor on before this
 * client failed to read it, and the way to find out is to look again rather than
 * to guess, which a restart does.
 */
function setupRefusal(failure: ApiFailure): string {
  switch (failure.kind) {
    case "unreachable":
      return "Could not reach the server, so two-factor is still off. Check your connection and try again.";
    case "refused":
      return failure.message;
    case "malformed":
      return "The server answered with something this app did not understand. Two-factor may have been turned on; reopen the app to see where it stands.";
    case "unauthorised":
      return "";
  }
}

/**
 * Ask before turning two-factor off.
 *
 * `lib/confirm-sign-out` is the model and deliberately not the function, exactly
 * as on the sessions screen: same shape, so the destructive button is marked as
 * such on iOS, and so a dismissal resolves rather than leaving the caller's
 * promise hanging, which Android's back gesture would otherwise do.
 */
function confirmDisable(hasPassword: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      TWO_FACTOR_DISABLE_CONFIRMATION.title,
      disableConfirmationMessage({ hasPassword }),
      [
        {
          text: TWO_FACTOR_DISABLE_CONFIRMATION.cancelLabel,
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: TWO_FACTOR_DISABLE_CONFIRMATION.confirmLabel,
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function AccountTwoFactorScreen() {
  const insets = useSafeAreaInsets();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, accountUpdated, retry } = useAuth();

  // Read live rather than frozen: this screen exists to change it, and the
  // change has to show. See the header comment.
  const account = state.status === "signed-in" ? state.user : null;

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState<TwoFactorActionKind | null>(null);
  const [failure, setFailure] = useState<
    { kind: TwoFactorActionKind; message: string } | null
  >(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [turnedOff, setTurnedOff] = useState(false);
  /**
   * A setup that has started and not yet turned anything on. Held here and
   * nowhere else for the codes' reason: the key and the codes exist in the one
   * answer that minted them, and leaving this screen discards them, which is
   * harmless because the factor is off until the code comes back.
   */
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [turnedOn, setTurnedOn] = useState(false);

  const passwordRef = useRef<TextInputInstance>(null);
  const setupCodeRef = useRef<TextInputInstance>(null);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const status = account ? twoFactorStatus(account) : "off";
  const actions = account ? twoFactorActions(account) : [];
  const wantsPassword = account ? asksForPassword(account) : false;
  const copy = TWO_FACTOR_COPY[status];

  const run = useCallback(
    (kind: TwoFactorActionKind) => {
      if (busy || confirming || !account) return;

      // The buttons are never disabled for an empty password field, per
      // AGENTS.md: an incomplete submission is how its validation reaches
      // somebody at all. So the check runs here and answers for whatever has
      // been typed, including nothing.
      const check = checkTwoFactorPassword(account, password);
      setPasswordError(check.error);
      if (check.error !== null) {
        hapticWarning();
        passwordRef.current?.focus();
        return;
      }

      const send = () => {
        setBusy(kind);
        setFailure(null);

        const call =
          kind === "enable"
            ? startTwoFactorSetup(check.password)
            : kind === "disable"
              ? disableTwoFactor(check.password)
              : generateBackupCodes(check.password);

        void call.then((result) => {
          if (!live.current) return;
          setBusy(null);

          if (!result.ok) {
            hapticWarning();
            setFailure({ kind, message: actionRefusal(kind, result.failure) });
            return;
          }

          hapticSuccess();
          // Cleared on success only. A failure keeps it, because the retry
          // beside the failure would otherwise ask somebody to type it again
          // to repeat something they already asked for.
          setPassword("");
          setRevealed(false);

          if (Array.isArray(result.value)) {
            setCodes(result.value);
            setCopied(false);
            return;
          }

          if ("totpURI" in result.value) {
            setSetup(result.value);
            setSetupCode("");
            setSetupError(null);
            setOpenFailed(false);
            setKeyCopied(false);
            setCopied(false);
            setTurnedOff(false);
            return;
          }

          // The third of the three places the signed-in person is held, and the
          // one `lib/two-factor-api` cannot reach. It replaces the person in
          // place, so the status above rewrites itself to "off" and the two
          // controls go, with no navigation and nothing unmounted.
          accountUpdated(result.value);
          // Codes for a factor that is off protect nothing, and leaving them on
          // screen under a heading about backup codes would suggest otherwise.
          setCodes(null);
          setTurnedOn(false);
          setTurnedOff(true);
        });
      };

      if (kind === "disable") {
        void confirmDisable(account?.hasPassword === true).then((goAhead) => {
          if (goAhead && live.current) send();
        });
        return;
      }

      send();
    },
    [account, accountUpdated, busy, confirming, password],
  );

  /**
   * Send the code from the new authenticator entry, which is what turns it on.
   *
   * The shape is judged first, as at sign-in and by the same rule, because a
   * code that could only come back refused should not cost a request.
   */
  const onConfirmSetup = useCallback(() => {
    if (!setup || confirming) return;

    const shape = codeError(setupCode, "totp");
    setSetupError(shape);
    if (shape !== null) {
      hapticWarning();
      setupCodeRef.current?.focus();
      return;
    }

    setConfirming(true);
    void confirmTwoFactorSetup(setupCode).then((result) => {
      if (!live.current) return;
      setConfirming(false);

      if (!result.ok) {
        hapticWarning();
        setSetupError(setupRefusal(result.failure) || null);
        return;
      }

      hapticSuccess();
      // As for a disable: the card above rewrites itself to "on" and the
      // setup goes, with no navigation.
      accountUpdated(result.value);
      setSetup(null);
      setSetupCode("");
      setTurnedOff(false);
      setTurnedOn(true);
    });
  }, [accountUpdated, confirming, setup, setupCode]);

  /**
   * Leave the setup. Nothing is sent: the factor is off until a code comes
   * back, and the next setup overwrites the one abandoned here.
   */
  const onCancelSetup = useCallback(() => {
    if (confirming) return;
    setSetup(null);
    setSetupCode("");
    setSetupError(null);
  }, [confirming]);

  const onOpenAuthenticator = useCallback(() => {
    if (!setup) return;
    setOpenFailed(false);
    // Opened rather than asked about first: on Android `canOpenURL` answers
    // false for any scheme the manifest does not declare a query for, so asking
    // would refuse a link the phone could have opened.
    Linking.openURL(setup.totpURI).catch(() => {
      if (live.current) setOpenFailed(true);
    });
  }, [setup]);

  const onCopyKey = useCallback(() => {
    if (!setup) return;
    void Clipboard.setStringAsync(setup.secret).then(() => {
      if (!live.current) return;
      hapticSuccess();
      setKeyCopied(true);
    });
  }, [setup]);

  /** The codes on screen, whichever card is showing them. */
  const shownCodes = setup?.backupCodes ?? codes;

  const onCopyCodes = useCallback(() => {
    if (!shownCodes) return;
    // One code per line, which is what somebody pasting into a password manager
    // or a notes app wants, and the same order they are drawn in.
    void Clipboard.setStringAsync(shownCodes.join("\n")).then(() => {
      if (!live.current) return;
      hapticSuccess();
      setCopied(true);
    });
  }, [shownCodes]);

  // While a setup is open its card is the whole of what this screen offers:
  // the button that started it, and the password that confirmed it, have done
  // their work.
  const offered = setup ? [] : actions;

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Two-factor authentication
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
          {account ? (
            <View className="flex-row items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
              <View className="mt-0.5">
                {/* A word as well as an icon: a state told only by a shape and a
                    colour is a state nobody reading with a screen reader or
                    without colour ever gets. */}
                {status === "on" ? (
                  <ShieldCheck color={colors.success} size={20} />
                ) : (
                  <Shield color={colors.muted} size={20} />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="title" className="text-ink">
                  {copy.statusLine}
                </Text>
                <Text variant="label" className="mt-1 font-normal leading-5 text-muted">
                  {copy.detail}
                </Text>
              </View>
            </View>
          ) : (
            // Unreachable behind the gate in front of every screen, which sends
            // a signed-out person to sign-in. It is here because a screen that
            // could not say what it is for must not be a blank one, and the
            // retry is hydration's own: the only way this state is reached is a
            // cold start that could not resolve a session.
            <View className="gap-3 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
              <View>
                <Text variant="title" className="text-ink">
                  Could not read your account
                </Text>
                <Text variant="label" className="font-normal leading-5 text-muted">
                  This device could not work out whether two-factor is on. Nothing
                  about your account has changed.
                </Text>
              </View>
              <Button
                variant="outline"
                className="min-h-12"
                accessibilityLabel="Try reading your account again"
                onPress={retry}
              >
                <Text>Try again</Text>
              </Button>
            </View>
          )}

          {/* Said out loud as well as shown by the card above rewriting itself,
              because the change somebody just made is the one thing they are
              waiting to have confirmed. */}
          {turnedOff ? (
            <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5">
              <View className="mt-0.5">
                <Check color={colors.primary} size={16} />
              </View>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="min-w-0 flex-1 font-normal leading-5 text-ink"
              >
                Two-factor authentication has been turned off. You are still
                signed in on this device.
              </Text>
            </View>
          ) : null}

          {turnedOn ? (
            <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5">
              <View className="mt-0.5">
                <Check color={colors.success} size={16} />
              </View>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="min-w-0 flex-1 font-normal leading-5 text-ink"
              >
                Two-factor authentication is on. Signing in asks for a code from
                your authenticator app, or one of your backup codes.
              </Text>
            </View>
          ) : null}

          {setup ? (
            <View className="mt-4 gap-3 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
              <Text variant="title" className="text-ink">
                {TWO_FACTOR_SETUP_COPY.title}
              </Text>

              <Text variant="label" className="text-ink">
                {TWO_FACTOR_SETUP_COPY.keyStep}
              </Text>
              <Button
                className="min-h-12"
                accessibilityLabel={TWO_FACTOR_SETUP_COPY.openAccessibilityLabel}
                disabled={confirming}
                accessibilityState={{ disabled: confirming }}
                onPress={onOpenAuthenticator}
              >
                <ExternalLink color={colors.primaryForeground} size={16} />
                <Text>{TWO_FACTOR_SETUP_COPY.openLabel}</Text>
              </Button>
              {openFailed ? (
                <Text
                  accessibilityLiveRegion="polite"
                  variant="label"
                  className="font-normal leading-5 text-amber"
                >
                  {TWO_FACTOR_SETUP_COPY.openFailed}
                </Text>
              ) : null}
              {/* The way in from a second phone. Inside the setup branch, so
                  cancelling or finishing unmounts it with the key. */}
              <Text variant="label" className="mt-1 font-normal text-muted">
                {TWO_FACTOR_SETUP_COPY.scanHint}
              </Text>
              <SetupQrCode
                text={setup.totpURI}
                accessibilityLabel={TWO_FACTOR_SETUP_COPY.qrAccessibilityLabel}
              />
              <View className="gap-1 rounded-2xl bg-line/35 p-3">
                <Text variant="label" className="font-normal text-muted">
                  {TWO_FACTOR_SETUP_COPY.keyLabel}
                </Text>
                <Text variant="mono" selectable className="min-w-0 text-ink">
                  {groupSetupKey(setup.secret)}
                </Text>
              </View>
              <Button
                variant="outline"
                className="min-h-12"
                accessibilityLabel={TWO_FACTOR_SETUP_COPY.copyKeyAccessibilityLabel}
                onPress={onCopyKey}
              >
                {keyCopied ? (
                  <Check color={colors.success} size={16} />
                ) : (
                  <Copy color={colors.inkSoft} size={16} />
                )}
                <Text>{keyCopied ? BACKUP_CODES_COPY.copiedLabel : TWO_FACTOR_SETUP_COPY.copyKeyLabel}</Text>
              </Button>

              <Text variant="label" className="mt-2 text-ink">
                {TWO_FACTOR_SETUP_COPY.codesStep}
              </Text>
              <Text variant="label" className="font-normal leading-5 text-amber">
                {TWO_FACTOR_SETUP_COPY.codesWarning}
              </Text>
              <View className="gap-1 rounded-2xl bg-line/35 p-3">
                {setup.backupCodes.map((code, index) => (
                  <Text
                    key={`${index}-${code}`}
                    variant="mono"
                    selectable
                    className="min-w-0 text-ink"
                  >
                    {code}
                  </Text>
                ))}
              </View>
              <Button
                variant="outline"
                className="min-h-12"
                accessibilityLabel={BACKUP_CODES_COPY.copyAccessibilityLabel}
                onPress={onCopyCodes}
              >
                {copied ? (
                  <Check color={colors.success} size={16} />
                ) : (
                  <Copy color={colors.inkSoft} size={16} />
                )}
                <Text>
                  {copied ? BACKUP_CODES_COPY.copiedLabel : BACKUP_CODES_COPY.copyLabel}
                </Text>
              </Button>

              <Text variant="label" className="mt-2 text-ink">
                {TWO_FACTOR_SETUP_COPY.codeStep}
              </Text>
              <View>
                <Input
                  ref={setupCodeRef}
                  className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base tracking-[6px] text-ink"
                  placeholder="123456"
                  accessibilityLabel={TWO_FACTOR_SETUP_COPY.codeLabel}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  maxLength={16}
                  returnKeyType="go"
                  onSubmitEditing={onConfirmSetup}
                  value={setupCode}
                  onChangeText={(value) => {
                    setSetupCode(value);
                    setSetupError(null);
                  }}
                />
                {setupError ? (
                  <View
                    className="mt-1.5 flex-row items-center gap-1.5"
                    accessibilityLiveRegion="polite"
                  >
                    <AlertCircle color={colors.danger} size={14} />
                    <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
                      {setupError}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Button
                className="min-h-12"
                accessibilityLabel={TWO_FACTOR_SETUP_COPY.confirmAccessibilityLabel}
                accessibilityState={{ disabled: confirming, busy: confirming }}
                disabled={confirming}
                onPress={onConfirmSetup}
              >
                {confirming ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : null}
                <Text>{TWO_FACTOR_SETUP_COPY.confirmLabel}</Text>
              </Button>
              <Button
                variant="outline"
                className="min-h-12"
                accessibilityLabel={TWO_FACTOR_SETUP_COPY.cancelAccessibilityLabel}
                accessibilityState={{ disabled: confirming }}
                disabled={confirming}
                onPress={onCancelSetup}
              >
                <Text>{TWO_FACTOR_SETUP_COPY.cancelLabel}</Text>
              </Button>
            </View>
          ) : null}

          {/* Once, and only here. No route reads these back, so this card is the
              only place they will ever exist. The warning sits above them rather
              than under them, where somebody who stops reading at the codes
              would never get to it. */}
          {codes ? (
            <View className="mt-4 gap-3 rounded-3xl border border-amber/40 bg-surface p-4 shadow-md shadow-black/5">
              <Text variant="title" className="text-ink">
                {BACKUP_CODES_COPY.title}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="font-normal leading-5 text-amber"
              >
                {BACKUP_CODES_COPY.warning}
              </Text>

              <View className="gap-1 rounded-2xl bg-line/35 p-3">
                {/* Keyed by position as well as by value: nothing promises a
                    set has no repeat in it, and a duplicate key would drop a
                    code somebody is being told to store. */}
                {codes.map((code, index) => (
                  <Text
                    key={`${index}-${code}`}
                    variant="mono"
                    selectable
                    className="min-w-0 text-ink"
                  >
                    {code}
                  </Text>
                ))}
              </View>

              <Text variant="label" className="font-normal leading-5 text-muted">
                {BACKUP_CODES_COPY.usage}
              </Text>

              {/* Nobody should be copying twelve codes out by hand, and one
                  transcribed wrong is a code that fails at the moment it is
                  needed. */}
              <Button
                variant="outline"
                className="min-h-12"
                accessibilityLabel={BACKUP_CODES_COPY.copyAccessibilityLabel}
                onPress={onCopyCodes}
              >
                {copied ? (
                  <Check color={colors.success} size={16} />
                ) : (
                  <Copy color={colors.inkSoft} size={16} />
                )}
                <Text>
                  {copied ? BACKUP_CODES_COPY.copiedLabel : BACKUP_CODES_COPY.copyLabel}
                </Text>
              </Button>
            </View>
          ) : null}

          {/* Drawn only where the account has a password, which is exactly when
              the API requires one. An account that signs in by link or with
              Google has nothing to prove, and an empty box for it would invite
              somebody to invent one. */}
          {offered.length > 0 && wantsPassword ? (
            <View className="mt-5">
              <Text variant="label" className="mb-1.5 text-ink">
                {TWO_FACTOR_PASSWORD_COPY.label}
              </Text>
              <View className="relative justify-center">
                <Input
                  ref={passwordRef}
                  className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
                  placeholder="••••••••"
                  accessibilityLabel={TWO_FACTOR_PASSWORD_COPY.label}
                  secureTextEntry={!revealed}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  // Both, deliberately: Android reads `autoComplete` and iOS
                  // reads `textContentType`, and without the pair a password
                  // manager has nothing to offer. This is the password that
                  // already exists, so it asks for the stored one.
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="done"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    // The complaint goes the moment somebody acts on it, rather
                    // than standing until the next tap tells them again what
                    // they are in the middle of fixing.
                    setPasswordError(null);
                    setFailure(null);
                  }}
                />
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={revealed ? "Hide your password" : "Show your password"}
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

              {passwordError ? (
                <View
                  className="mt-1.5 flex-row items-center gap-1.5"
                  accessibilityLiveRegion="polite"
                >
                  <AlertCircle color={colors.danger} size={14} />
                  <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
                    {passwordError}
                  </Text>
                </View>
              ) : (
                <Text variant="label" className="mt-1.5 font-normal leading-5 text-muted">
                  {TWO_FACTOR_PASSWORD_COPY.hint}
                </Text>
              )}

              {/* The way out for somebody signed in who no longer knows the
                  password this asks for. Inside the branch above, so an account
                  with no password never sees it. An account with no address
                  has nowhere to send a link, so it draws nothing. */}
              {account?.email.trim() ? (
                <ForgotPasswordLink
                  email={account.email.trim()}
                  audience="own"
                  disabled={busy !== null}
                />
              ) : null}
            </View>
          ) : null}

          {/* An action that did not happen says so and offers the same one
              again, rather than leaving somebody to work out whether anything
              changed. Silent for an expired session, which is already on its way
              to sign-in. */}
          {failure && failure.message !== "" ? (
            <View className="mt-4 gap-3 rounded-2xl border border-danger/30 bg-surface p-4">
              <View className="flex-row items-start gap-2.5">
                <View className="mt-0.5">
                  <AlertCircle color={colors.danger} size={16} />
                </View>
                <Text
                  accessibilityLiveRegion="polite"
                  variant="label"
                  className="min-w-0 flex-1 font-normal leading-5 text-danger"
                >
                  {failure.message}
                </Text>
              </View>
              <Button
                variant="outline"
                className="min-h-11"
                accessibilityLabel={
                  failure.kind === "disable"
                    ? "Try turning two-factor authentication off again"
                    : failure.kind === "enable"
                      ? "Try setting up two-factor authentication again"
                      : "Try generating new backup codes again"
                }
                accessibilityState={{ disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() => run(failure.kind)}
              >
                <Text>Try again</Text>
              </Button>
            </View>
          ) : null}

          {/* One control with two-factor off and two with it on, and none while
              a setup card is open. */}
          {offered.map((action) => (
            <Button
              key={action.kind}
              variant="outline"
              className={
                action.destructive
                  ? "mt-4 min-h-12 border-danger/30 active:bg-danger/10"
                  : action.kind === "enable"
                    ? "mt-4 min-h-12"
                    : "mt-3 min-h-12"
              }
              accessibilityLabel={action.accessibilityLabel}
              accessibilityState={{ disabled: busy !== null }}
              // Disabled only once a request is out, per AGENTS.md, and then
              // every control is, because two of these racing would leave the
              // screen reflecting whichever answered last.
              disabled={busy !== null}
              onPress={() => run(action.kind)}
            >
              {busy === action.kind ? (
                <ActivityIndicator
                  color={action.destructive ? colors.danger : colors.primary}
                  size="small"
                />
              ) : null}
              {/* The label stays whatever the spinner is doing. */}
              <Text className={action.destructive ? "text-danger" : undefined}>
                {action.label}
              </Text>
            </Button>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
