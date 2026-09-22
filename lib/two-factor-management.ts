/**
 * What the two-factor screen says, what it offers, and the one thing it refuses
 * to offer.
 *
 * Pure and table-tested, beside `components/settings/account-two-factor-screen`,
 * which owns the drawing, and `lib/two-factor-api`, which owns the two paths.
 * The same split every rules module here has, `lib/password-rules`,
 * `lib/account-session-rows`, `lib/composer-access`, and for the same reason:
 * nothing in this file imports anything native, so the rules ticket 07 turns on
 * are a table of cases rather than something only a running phone can
 * demonstrate.
 *
 * The rules, all from ticket 07 and
 * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`:
 *
 * 1. **The screen reports the state and never asks for it.** `twoFactorEnabled`
 *    on the signed-in person is the whole input, parsed at sign-in by
 *    `parseSessionUser` and carried on `SessionUser`. There is no second read
 *    for it, because the client was handed it and keeping it would be cheaper
 *    than asking again even if a route existed.
 * 2. **Two-factor on offers exactly two things, turning it off and replacing the
 *    backup codes.** Nothing else, in either order, ever.
 * 3. **Two-factor off offers nothing at all.** The action list is empty, and
 *    that emptiness is this module's answer rather than a control a component
 *    happened not to draw. See the section below, which is the whole reason this
 *    screen is half a screen.
 * 4. **A password is required exactly when the account has one.** Read off
 *    `hasPassword`, so an account that signs in by link or with Google alone is
 *    drawn no password field and sends no password. The API is why, and the
 *    working is below.
 *
 * ## Why there is no control here that turns two-factor on
 *
 * `POST /auth/two-factor/enable` and `GET /auth/two-factor/get-totp-uri` both
 * exist, both work, and both stay unused by this client. That is ticket 08, and
 * ticket 08 is blocked on
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`.
 *
 * The reason is a lockout rather than a scope cut.
 * `POST /auth/two-factor/verify-backup-code` carries `@UseGuards(AuthGuard)`,
 * which resolves a full Better Auth session, and at challenge time there is no
 * session, only the short-lived `better-auth.two_factor` cookie. So a backup
 * code is suspected to be unredeemable at the one moment it exists for. Offering
 * enable while the only recovery path for the factor may be broken would let
 * somebody turn on a lock and throw away the only spare key, from the device
 * they are most likely to lose. Issue 02 confirms that suspicion before anything
 * concludes, because reading the code is not running it, and ADR-0013 makes it a
 * blocking edge rather than a note.
 *
 * Anybody arriving here to add an enable control is in the wrong ticket. The
 * test beside this file asserts that no action list ever contains one, so
 * adding it is a failing test rather than a review comment somebody might miss.
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
 * There is deliberately no `enable`, and the omission is the type's job rather
 * than a component's: a screen cannot draw a control this union has no name for,
 * so the boundary in the header is enforced at compile time before any test
 * runs.
 */
export type TwoFactorActionKind = "disable" | "regenerate-backup-codes";

/** A control, named twice, once for the eye and once for a screen reader. */
export type TwoFactorAction = {
  kind: TwoFactorActionKind;
  label: string;
  accessibilityLabel: string;
  /**
   * Whether this is confirmed before it happens, per `AGENTS.md`.
   *
   * True for turning two-factor off and false for replacing the codes, which
   * looks inconsistent and is not. Turning it off takes a protection away and
   * gives nothing back. Replacing the codes hands the replacement over in the
   * same breath, on the same screen, so what it takes away is visibly returned
   * rather than gone.
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
 * A list that is allowed to be empty, which is `lib/wall-actions`' shape and is
 * load-bearing here: an account with two-factor off gets nothing rather than a
 * greyed-out control that invites somebody to work out why it cannot be tapped.
 *
 * Turning off is first because it is what somebody who opened this screen with
 * two-factor on most often came for, and it is the destructive one, so it is
 * drawn as such rather than hidden under the safer control.
 */
export function twoFactorActions(
  account: Pick<TwoFactorAccount, "twoFactorEnabled">,
): TwoFactorAction[] {
  if (twoFactorStatus(account) === "off") return [];

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
 * The off state names the absence rather than leaving somebody hunting for a
 * control that is not there. It says nothing about the web app: pointing at
 * another client that would enable it is offering the thing rule 3 withholds,
 * one indirection later, and the reason it is withheld applies to any device
 * that account ends up locked out of.
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
      "Signing in asks for your password alone. Turning two-factor on is not something this app does yet.",
  },
};

/** The password field, where there is one. */
export const TWO_FACTOR_PASSWORD_COPY = {
  label: "Your password",
  hint: "Confirms it is you before either of these goes ahead.",
} as const;

/**
 * Turning it off, asked before it happens.
 *
 * `AGENTS.md` confirms a destructive action, and this one has no undo anywhere
 * in this app: nothing here turns two-factor back on, so somebody who taps this
 * by accident cannot repair it from the phone they are holding. The message says
 * that rather than leaving it to be discovered.
 */
export const TWO_FACTOR_DISABLE_CONFIRMATION = {
  title: "Turn off two-factor authentication?",
  message:
    "Your account will be protected by your password alone, and the backup codes you have now will stop working. This app cannot turn it back on.",
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
