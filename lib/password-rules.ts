/**
 * Setting a first password, or changing one, and everything that differs
 * between the two.
 *
 * Pure and table-tested, beside `components/settings/account-password-screen`,
 * which owns the drawing, and `lib/password-api`, which owns the two paths. The
 * same split every rules module here has — `lib/sign-in-steps`,
 * `lib/account-session-rows`, `lib/composer-access` — and for the same reason:
 * nothing in this file imports anything native, so the rules ticket 06 turns on
 * are a table of cases rather than something only a running phone can
 * demonstrate.
 *
 * The rules, all from ticket 06 and
 * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`:
 *
 * 1. **The screen decides which of the two it is doing.** `hasPassword` on the
 *    signed-in person answers it, and it is the only input. Nobody is asked, and
 *    there is no control for switching, because "do you have a password" is a
 *    question the app already has the answer to.
 * 2. **A current password is required when changing and has no field at all
 *    when setting.** Not a field that is present and optional: a magic-link-only
 *    or Google-only account has nothing to prove, and drawing an empty box for
 *    it would invite somebody to invent one. Requiring it when changing is what
 *    stops whoever is holding an unlocked phone silently replacing it.
 * 3. **The new password is 8 to 128 characters, in both modes, and the sentence
 *    saying so is shown before submission.** There is no complexity rule. Both
 *    numbers come from `passwordSchema` in the API's
 *    `core/validators/common.schema.ts` and are held here once, so the sentence a
 *    person reads and the rule this module enforces cannot drift apart.
 * 4. **A confirmation that does not match is caught here, never by the server.**
 *    The API has no confirmation field, so a mismatch that reached it would
 *    quietly set the wrong password rather than be refused.
 *
 * ## Why every value is trimmed
 *
 * `baseString` in the API's `common.schema.ts` calls `.trim()` before it applies
 * the minimum and the maximum, so the password that is stored is the trimmed
 * one. A client that measured the raw value would pass a password the server
 * then shortened and refused, and somebody whose keyboard added a trailing space
 * would end up with a stored password they could never type again. Trimming here
 * is `AGENTS.md`'s "trim values to handle text expansion trailing spaces", and
 * the API is why it is right rather than merely tidy. Whitespace *inside* a
 * password is part of it and is kept, which is what makes a passphrase work.
 *
 * ## Why an incomplete form still gets an answer
 *
 * `AGENTS.md` keeps submit enabled until the request starts and asks that an
 * incomplete form be submittable so its validation is surfaced. So
 * `checkPassword` answers for an empty draft rather than assuming the screen
 * refused to send one, and it answers per field, because errors belong next to
 * the field they are about and the screen has to focus the first of them.
 */

/** Which of the two things the screen is doing. */
export type PasswordMode = "set" | "change";

/** From `passwordSchema` in the API's `core/validators/common.schema.ts`. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * The rule, in one sentence, shown before submission rather than after a
 * rejection.
 *
 * One sentence rather than one per mode, because it is one rule: the API applies
 * `validateNewPassword` to both routes. A second copy of it in a per-mode record
 * would be a place for the two to drift.
 */
export const PASSWORD_LENGTH_RULE = `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters. Nothing else is required.`;

/** Rule 1. The signed-in person is the whole input. */
export function passwordMode(account: { hasPassword: boolean }): PasswordMode {
  return account.hasPassword ? "change" : "set";
}

/** Rule 2, as the screen asks it. */
export function asksForCurrentPassword(mode: PasswordMode): boolean {
  return mode === "change";
}

/** The three fields this form can have, named for errors and for focus. */
export type PasswordField = "current" | "next" | "confirmation";

/**
 * The fields the mode draws, in the order they appear.
 *
 * The order is load-bearing twice over: it is the tab order on screen, and it is
 * what decides which field a failed submission focuses.
 */
export function passwordFields(mode: PasswordMode): PasswordField[] {
  return asksForCurrentPassword(mode)
    ? ["current", "next", "confirmation"]
    : ["next", "confirmation"];
}

/**
 * What is in the form, exactly as typed.
 *
 * `current` is held for both modes so the screen has one piece of state whatever
 * the mode is. In set mode it is never drawn, never read and never sent.
 */
export type PasswordDraft = {
  current: string;
  next: string;
  confirmation: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = {
  current: "",
  next: "",
  confirmation: "",
};

/**
 * Exactly what goes over the wire, and nothing else.
 *
 * A discriminated union rather than one optional-field object, because both
 * routes take a `z.strictObject`: an extra key is refused outright rather than
 * ignored, so a `currentPassword` left behind by a screen that started in the
 * other mode would fail the whole request. Assembling the body here rather than
 * at the call site is what makes that impossible instead of merely unlikely.
 */
export type PasswordSubmission =
  | { mode: "set"; newPassword: string }
  | { mode: "change"; currentPassword: string; newPassword: string };

export type PasswordCheck = {
  /** One sentence per field that has something wrong with it. */
  errors: Partial<Record<PasswordField, string>>;
  /** The field to focus on a failed submit, or null when nothing is wrong. */
  firstError: PasswordField | null;
  /** The body to send, or null when this form may not be submitted yet. */
  submission: PasswordSubmission | null;
};

const MISSING_CURRENT = "Enter your current password.";
const MISSING_NEXT = "Enter a new password.";
const TOO_SHORT = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
const TOO_LONG = `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
const MISSING_CONFIRMATION = "Repeat your new password.";
const MISMATCH = "This does not match the new password.";

/** What is wrong with the new password, or null. */
function newPasswordError(value: string): string | null {
  if (value === "") return MISSING_NEXT;
  if (value.length < PASSWORD_MIN_LENGTH) return TOO_SHORT;
  if (value.length > PASSWORD_MAX_LENGTH) return TOO_LONG;
  return null;
}

/**
 * Whether this form may be submitted yet, and if not what is wrong with which
 * field.
 *
 * The current password is checked for presence only. Whether it is the *right*
 * password is the server's answer, and a length complaint about one that is
 * simply wrong would send somebody looking for a problem that is not there — as
 * would refusing to submit a password that predates the current rule.
 */
export function checkPassword(
  mode: PasswordMode,
  draft: PasswordDraft,
): PasswordCheck {
  const current = draft.current.trim();
  const next = draft.next.trim();
  const confirmation = draft.confirmation.trim();

  const errors: Partial<Record<PasswordField, string>> = {};

  if (asksForCurrentPassword(mode) && current === "") {
    errors.current = MISSING_CURRENT;
  }

  const nextError = newPasswordError(next);
  if (nextError) errors.next = nextError;

  if (confirmation === "") {
    errors.confirmation = MISSING_CONFIRMATION;
  } else if (confirmation !== next) {
    // Rule 4. Reported on the confirmation rather than on both fields: the
    // person knows which of the two they meant, and colouring the new password
    // as well would suggest there is something wrong with it.
    errors.confirmation = MISMATCH;
  }

  const firstError =
    passwordFields(mode).find((field) => errors[field] !== undefined) ?? null;

  if (firstError !== null) return { errors, firstError, submission: null };

  return {
    errors,
    firstError: null,
    submission: asksForCurrentPassword(mode)
      ? { mode: "change", currentPassword: current, newPassword: next }
      : { mode: "set", newPassword: next },
  };
}

/**
 * What each mode says.
 *
 * Two wordings rather than one, for `lib/sign-in-steps`' reason: "you have no
 * password yet" and "you are replacing the one you have" are different news, and
 * a sentence covering both would be vague enough to be useless to either person.
 *
 * The success line says the session survived, which is ticket 06's own
 * acceptance criterion and a fact about the API rather than a reassurance this
 * client invented. `auth.service.ts` calls Better Auth's `setPassword` and
 * `changePassword` with the body alone — neither passes `revokeOtherSessions`,
 * and neither controller appends a `Set-Cookie` the way `updateProfile` does —
 * so no session is revoked and the session cookie this app holds is not rotated.
 * Read from `api/src/modules/auth/auth.controller.ts` and its service rather
 * than taken on trust.
 */
export const PASSWORD_COPY: Record<
  PasswordMode,
  {
    title: string;
    description: string;
    submitLabel: string;
    success: string;
  }
> = {
  set: {
    title: "Set a password",
    description:
      "This account signs in by link or with Google. A password gives you another way in when email is not to hand.",
    submitLabel: "Set password",
    success: "Password set. You are still signed in on this device.",
  },
  change: {
    title: "Change your password",
    description:
      "Enter the password you use now, then the one you want instead.",
    submitLabel: "Change password",
    success: "Password changed. You are still signed in on this device.",
  },
};
