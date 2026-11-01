/**
 * What the two-factor screen says and what it offers.
 *
 * Pure and table-tested, beside `components/settings/account-two-factor-screen`,
 * which owns the drawing, and `lib/two-factor-api`, which owns the paths.
 * The same split every rules module here has, `lib/password-rules`,
 * `lib/account-session-rows`, `lib/conversation-access`, and for the same reason:
 * nothing in this file imports anything native, so the rules tickets 07 and 08
 * turn on are a table of cases rather than something only a running phone can
 * demonstrate.
 *
 * The rules, from tickets 07 and 08 and
 * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`:
 *
 * 1. **The screen reports the state and never asks for it.** `twoFactorEnabled`
 *    on the signed-in person is the whole input, parsed at sign-in by
 *    `parseSessionUser` and carried on `SessionUser`. There is no second read
 *    for it, because the client was handed it and keeping it would be cheaper
 *    than asking again even if a route existed.
 * 2. **Two-factor on offers exactly two things, turning it off and replacing the
 *    backup codes.** Nothing else, in either order, ever.
 * 3. **Two-factor off offers exactly one thing, turning it on.** Ticket 08. It
 *    was withheld while a backup code could not be redeemed at sign-in, and the
 *    section below says what changed.
 * 4. **A password is required exactly when the account has one.** Read off
 *    `hasPassword`, so an account that signs in by link or with Google alone is
 *    drawn no password field and sends no password. The API is why, and the
 *    working is below. Turning it on asks under the same rule, because
 *    `POST /auth/two-factor/enable` takes the same body and better-auth checks
 *    it with the same function.
 *
 * ## Why turning it on was withheld, and why it no longer is
 *
 * Turning on a factor hands somebody backup codes as the only way in without
 * their authenticator. `POST /auth/two-factor/verify-backup-code` used to carry
 * `@UseGuards(AuthGuard)`, which resolves a full session, and at challenge time
 * there is no session, only the short-lived `better-auth.two_factor` cookie. So
 * a backup code could not be redeemed at the one moment it exists for, and
 * offering enable would have let somebody turn on a lock and throw away the only
 * spare key, from the device they are most likely to lose.
 *
 * The API dropped the guard, because better-auth's `verifyBackupCode`
 * authenticates from the challenge cookie or a session by itself.
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`
 * ran the whole thing against the API: a backup code presented with only the
 * challenge cookie answered 201 with a session. The sign-in challenge on this
 * client takes one now, so the spare key works where it has to, and enable is
 * offered.
 *
 * The test beside this file asserts the shape of both lists, so an enable
 * control leaking into the on state, or going missing from the off one, is a
 * failing test rather than a review comment somebody might miss.
 *
 * ## When the API wants a password, and how that was established
 *
 * `api/src/modules/auth/auth.factory.ts` configures the plugin as
 * `twoFactor({ allowPasswordless: true })`. In
 * `api/node_modules/better-auth/dist/utils/password.mjs`,
 * `shouldRequirePassword(ctx, userId, allowPasswordless)` is
 * `!allowPasswordless || Boolean(credentialAccount?.password)`, and both
 * endpoints in `.../plugins/two-factor/index.mjs` call it before they do
 * anything: disable throws `INVALID_PASSWORD` on a missing one, and
 * generate-backup-codes does the same. With `allowPasswordless` on, that reduces
 * to "the account has a credential password", which is what `hasPassword`
 * reports. Omitting the password for an account that has one is a 400, and
 * sending an empty string is the same 400 wearing a different hat.
 *
 * One asymmetry is deliberate and is the safe way round. `hasPassword` is the
 * API's `hasCredentialAccount`, which is the existence of a credential row,
 * while better-auth tests the password column on that row. A row with no
 * password would therefore have this module ask for one the server does not
 * check, which costs a person one field. The reverse, a password the server
 * demands and this screen never drew, cannot happen, because no credential row
 * means no password to demand.
 */

/** The half of the signed-in person this screen reads. Nothing else is needed. */
export type TwoFactorAccount = {
  twoFactorEnabled: boolean;
  hasPassword: boolean;
};

/** Rule 1, in the two words the screen puts on it. */
export type TwoFactorStatus = "on" | "off";

/**
 * Every action this screen may offer.
 *
 * `enable` starts a setup rather than finishing anything: the factor is on only
 * once a code from the new authenticator comes back, which is a step of the
 * screen and not an action of its own. See `lib/two-factor-api`.
 */
export type TwoFactorActionKind = "enable" | "disable" | "regenerate-backup-codes";

/** A control, named twice, once for the eye and once for a screen reader. */
export type TwoFactorAction = {
  kind: TwoFactorActionKind;
  label: string;
  accessibilityLabel: string;
  /**
   * Whether this is confirmed before it happens, per `AGENTS.md`.
   *
   * True for turning two-factor off and false for the other two, which looks
   * inconsistent and is not. Turning it off takes a protection away and gives
   * nothing back. Replacing the codes hands the replacement over in the same
   * breath, on the same screen, so what it takes away is visibly returned rather
   * than gone. Turning it on takes nothing away at all until its last step, and
   * that step is the person typing a code they could only have if it worked.
   */
  destructive: boolean;
};

/** Rule 1. The signed-in person is the whole input. */
export function twoFactorStatus(
  account: Pick<TwoFactorAccount, "twoFactorEnabled">,
): TwoFactorStatus {
  return account.twoFactorEnabled ? "on" : "off";
}

/**
 * Rules 2 and 3. What the screen offers, in the order it draws them.
 *
 * Turning off is first because it is what somebody who opened this screen with
 * two-factor on most often came for, and it is the destructive one, so it is
 * drawn as such rather than hidden under the safer control.
 */
export function twoFactorActions(
  account: Pick<TwoFactorAccount, "twoFactorEnabled">,
): TwoFactorAction[] {
  if (twoFactorStatus(account) === "off") {
    return [
      {
        kind: "enable",
        label: "Turn on two-factor",
        accessibilityLabel: "Turn on two-factor authentication for this account",
        destructive: false,
      },
    ];
  }

  return [
    {
      kind: "disable",
      label: "Turn off two-factor",
      accessibilityLabel: "Turn off two-factor authentication for this account",
      destructive: true,
    },
    {
      kind: "regenerate-backup-codes",
      label: "Generate new backup codes",
      // Says what happens to the codes somebody already has, because that is
      // the half of this action a person cannot see and the half they would
      // regret discovering afterwards.
      accessibilityLabel:
        "Generate new backup codes, which replaces the ones you have now",
      destructive: false,
    },
  ];
}

/** Rule 4, as the screen asks it: whether there is a password field at all. */
export function asksForPassword(
  account: Pick<TwoFactorAccount, "hasPassword">,
): boolean {
  return account.hasPassword;
}

export type TwoFactorPasswordCheck = {
  /** One sentence for the field, or null when there is nothing wrong. */
  error: string | null;
  /**
   * Exactly what the body carries, or null for a body of `{}`.
   *
   * Null rather than an empty string because both routes take a
   * `z.strictObject({ password?: string })`, and `{ password: "" }` is a
   * present-but-empty password the API refuses rather than an absent one it
   * allows.
   */
  password: string | null;
};

const MISSING_PASSWORD = "Enter your password.";

/**
 * Whether this action may go ahead yet, and what goes in the body if it may.
 *
 * Presence only. Whether it is the *right* password is the server's answer, and
 * a rule of this client's own about a password that is simply wrong would send
 * somebody looking for a problem that is not there, exactly as
 * `lib/password-rules` argues for the current-password field.
 *
 * Trimmed for `lib/password-rules`' reason: `baseString` in the API's
 * `core/validators/common.schema.ts` calls `.trim()` before anything else sees
 * the value, so a client that sent the untrimmed one would send a password the
 * server then shortened. Trimming here is what makes the two agree.
 *
 * Whatever was typed into a field that was never drawn is dropped rather than
 * sent, which matters because the body is strict: an account with no password
 * sends `{}` and only `{}`.
 */
export function checkTwoFactorPassword(
  account: Pick<TwoFactorAccount, "hasPassword">,
  typed: string,
): TwoFactorPasswordCheck {
  if (!asksForPassword(account)) return { error: null, password: null };

  const password = typed.trim();
  if (password === "") return { error: MISSING_PASSWORD, password: null };

  return { error: null, password };
}

/**
 * What each state says about itself.
 *
 * Two wordings rather than one, because "your account asks for a code" and
 * "your account asks for a password alone" are different news and a sentence
 * covering both would be vague enough to be useless to either person.
 *
 * The off state says what turning it on would change, because the control under
 * it is the one thing on the screen and the sentence is what it is weighed by.
 */
export const TWO_FACTOR_COPY: Record<
  TwoFactorStatus,
  { statusLine: string; detail: string }
> = {
  on: {
    statusLine: "Two-factor authentication is on",
    detail:
      "Signing in on a new device asks for a code from your authenticator app as well as your password.",
  },
  off: {
    statusLine: "Two-factor authentication is off",
    detail:
      "Signing in asks for your password alone. Turn it on to also ask for a code from an authenticator app.",
  },
};

/** The password field, where there is one. */
export const TWO_FACTOR_PASSWORD_COPY = {
  label: "Your password",
  hint: "Confirms it is you before this goes ahead.",
} as const;

/**
 * Turning it off, asked before it happens.
 *
 * `AGENTS.md` confirms a destructive action. Turning it back on is possible from
 * this screen, but it is a new authenticator entry and a new set of codes rather
 * than an undo, and the message says so rather than leaving it to be discovered.
 */
export const TWO_FACTOR_DISABLE_CONFIRMATION = {
  title: "Turn off two-factor authentication?",
  message:
    "Your account will be protected by your password alone, and the backup codes you have now will stop working. Turning it on again means setting up your authenticator app again.",
  confirmLabel: "Turn off",
  cancelLabel: "Cancel",
} as const;

/**
 * The codes, and the warning that has to arrive with them.
 *
 * Shown once and never again. The API answers with them in that one response and
 * no route reads them back, so a person who leaves this screen without storing
 * them has lost them, and the only way to another set is to generate another
 * set, which invalidates these. The warning is therefore not a nicety but the
 * single most important sentence on the screen, and it sits with the codes
 * rather than after them.
 */
export const BACKUP_CODES_COPY = {
  title: "Your new backup codes",
  warning:
    "These are shown once. Store them somewhere safe now, because they cannot be shown again, and the codes you had before have stopped working.",
  /** Each code is one use, which is the thing people most often get wrong. */
  usage: "Each code works once, in place of a code from your authenticator app.",
  copyLabel: "Copy codes",
  copiedLabel: "Copied",
  copyAccessibilityLabel: "Copy your backup codes to the clipboard",
} as const;

/**
 * The setup, in the order a person does it.
 *
 * Three steps on one card rather than three screens, because each needs what the
 * one before it put on screen: the key is what the app is given, the codes are
 * what replace the app, and the code is what proves the app has the key.
 *
 * The backup codes come before the code rather than after it, which is the
 * load-bearing choice. Once the code is accepted the factor is on, and a person
 * who has not stored the codes by then is the lockout ticket 08 was blocked on.
 * Shown first, they are stored while nothing depends on them yet.
 *
 * There is no QR code. Somebody setting up on this phone has the authenticator on
 * this phone too, and a phone cannot scan its own screen, so the link that opens
 * the app and the key to type by hand are the two ways that work.
 */
export const TWO_FACTOR_SETUP_COPY = {
  title: "Set up your authenticator app",
  keyStep: "1. Add this account to your authenticator app.",
  openLabel: "Open in authenticator app",
  openAccessibilityLabel: "Add this account to an authenticator app on this phone",
  openFailed:
    "No app on this phone could open the setup link. Copy the key below into your authenticator app instead.",
  keyLabel: "Setup key",
  copyKeyLabel: "Copy key",
  copyKeyAccessibilityLabel: "Copy the setup key to the clipboard",
  codesStep: "2. Store your backup codes.",
  codesWarning:
    "Each code signs you in once if you lose your authenticator app. They are shown once, so store them somewhere safe now.",
  codeStep: "3. Enter the code your authenticator app is showing.",
  codeLabel: "Authentication code",
  confirmLabel: "Turn on",
  confirmAccessibilityLabel: "Check the code and turn on two-factor authentication",
  cancelLabel: "Cancel setup",
  cancelAccessibilityLabel: "Cancel setting up two-factor authentication",
} as const;

/**
 * The setup key in groups of four, as authenticator apps show and accept it.
 *
 * For the eye only. The copy button copies the key as the API minted it,
 * because some apps refuse the spaces.
 */
export function groupSetupKey(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}
