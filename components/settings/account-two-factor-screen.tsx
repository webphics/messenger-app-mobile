import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  View,
  type TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
} from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import type { ApiFailure } from "@/lib/api-result";
import { useAuth } from "@/lib/auth-context";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { colors, screenBottomPad } from "@/lib/tokens";
import { disableTwoFactor, generateBackupCodes } from "@/lib/two-factor-api";
import {
  BACKUP_CODES_COPY,
  TWO_FACTOR_COPY,
  TWO_FACTOR_DISABLE_CONFIRMATION,
  TWO_FACTOR_PASSWORD_COPY,
  asksForPassword,
  checkTwoFactorPassword,
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
 * ## Why this screen is half a screen
 *
 * There is no way to turn two-factor **on** here, and that is a decision rather
 * than an omission. `POST /auth/two-factor/enable` and
 * `GET /auth/two-factor/get-totp-uri` both exist and both stay unused by this
 * client, because `POST /auth/two-factor/verify-backup-code` carries
 * `@UseGuards(AuthGuard)` and therefore resolves a full session, while at
 * challenge time there is none, only the short-lived `better-auth.two_factor`
 * cookie. So a backup code is suspected to be unredeemable at the one moment it
 * exists for. Offering enable while the only recovery path for the factor may be
 * broken would let somebody turn on a lock and throw away the only spare key,
 * from the device they are most likely to lose. Issue 02
 * (`.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`)
 * confirms that suspicion before anything concludes, ticket 08 is blocked on it,
 * and ADR-0013 makes it a blocking edge. The rule itself lives in
 * `lib/two-factor-management`, with a test asserting no action list ever
 * contains an enable action, so this file draws what it is handed and could not
 * draw one if it tried.
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
 * ## What happens to the signed-in person after a disable
 *
 * `lib/two-factor-api` brings the module mirror and the Kept person into line,
 * and this hands the answer to `accountUpdated` so the auth state agrees with
 * both. Without that last step the two-factor row on Settings goes on reporting
 * a factor that is off as on, until the app is restarted. See `lib/auth-context`.
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
 * The malformed wording differs between the two actions because the risk does.
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
        : "Could not reach the server, so your backup codes have not changed. Check your connection and try again.";
    case "refused":
      return failure.message;
    case "malformed":
      return kind === "disable"
        ? "The server answered with something this app did not understand. Two-factor may not have been turned off."
        : "The server answered with something this app did not understand, so no codes can be shown. The codes you had before may already have been replaced, so try again and store the ones that come back.";
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
function confirmDisable(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      TWO_FACTOR_DISABLE_CONFIRMATION.title,
      TWO_FACTOR_DISABLE_CONFIRMATION.message,
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

  const passwordRef = useRef<TextInput>(null);

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
      if (busy || !account) return;

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
          kind === "disable"
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

          // The third of the three places the signed-in person is held, and the
          // one `lib/two-factor-api` cannot reach. It replaces the person in
          // place, so the status above rewrites itself to "off" and the two
          // controls go, with no navigation and nothing unmounted.
          accountUpdated(result.value);
          // Codes for a factor that is off protect nothing, and leaving them on
          // screen under a heading about backup codes would suggest otherwise.
          setCodes(null);
          setTurnedOff(true);
        });
      };

      if (kind === "disable") {
        void confirmDisable().then((goAhead) => {
          if (goAhead && live.current) send();
        });
        return;
      }

      send();
    },
    [account, accountUpdated, busy, password],
  );

  const onCopyCodes = useCallback(() => {
    if (!codes) return;
    // One code per line, which is what somebody pasting into a password manager
    // or a notes app wants, and the same order they are drawn in.
    void Clipboard.setStringAsync(codes.join("\n")).then(() => {
      if (!live.current) return;
      hapticSuccess();
      setCopied(true);
    });
  }, [codes]);

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
          {actions.length > 0 && wantsPassword ? (
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

          {/* Empty for an account with two-factor off, which is the whole of
              ticket 07's last rule: that state is reported and nothing is
              offered that would change it. */}
          {actions.map((action) => (
            <Button
              key={action.kind}
              variant="outline"
              className={
                action.destructive
                  ? "mt-4 min-h-12 border-danger/30 active:bg-danger/10"
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
