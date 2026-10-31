import { identifierKind, normaliseIdentifier } from "@/lib/sign-in-identifier";

/**
 * What the sign-up step asks for, and what is wrong with it before it is sent.
 *
 * The rules mirror `POST /auth/sign-up` (`docs/api/auth.md`) for the reason
 * `lib/sign-in-identifier` mirrors the login route's: a value this screen
 * accepts and the API refuses comes back as a `422` the person cannot place on a
 * field. The phone is the exception. The API parses it and is the authority on
 * what a valid number is, as on the onboarding screen.
 */

export type SignUpFields = {
  name: string;
  username: string;
  email: string;
  phone: string;
};

export type SignUpFieldErrors = Partial<Record<keyof SignUpFields, string>>;

const NAME_MAX = 255;
const USERNAME = /^[a-zA-Z0-9_]+$/;
const USERNAME_MAX = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether the sign-up step needs an email field. Step one takes a username or an
 * address, and an address is already known, so it is shown in the row above the
 * form rather than asked for again. A username that matched nobody has no
 * address behind it, and the link has to go somewhere.
 */
export function signUpNeedsEmail(identifier: string): boolean {
  return identifierKind(identifier) === "username";
}

/** The fields the step opens with: whatever step one already said, in the slot it belongs to. */
export function signUpDefaults(identifier: string): SignUpFields {
  const typed = normaliseIdentifier(identifier);

  return signUpNeedsEmail(identifier)
    ? { name: "", username: typed, email: "", phone: "" }
    : { name: "", username: "", email: typed, phone: "" };
}

/** Every field's problem at once, so a submit can mark them all and focus the first. */
export function signUpFieldErrors(fields: SignUpFields): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};

  const name = fields.name.trim();
  if (name === "") errors.name = "Enter your name";
  else if (name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer`;

  const username = fields.username.trim();
  if (username === "") errors.username = "Choose a username";
  else if (username.length > USERNAME_MAX) {
    errors.username = `Username must be ${USERNAME_MAX} characters or fewer`;
  } else if (!USERNAME.test(username)) {
    errors.username = "Use only letters, numbers and underscores";
  }

  const email = fields.email.trim();
  if (email === "") errors.email = "Enter your email address";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address";

  return errors;
}

/** The order fields are drawn in, which is the order the first error is looked for in. */
export const SIGN_UP_FIELD_ORDER: readonly (keyof SignUpFields)[] = [
  "name",
  "username",
  "email",
  "phone",
];

/**
 * The sign-up step's one required box: agreeing to the Terms of Use (App Store
 * guideline 1.2). A sentence when it is not ticked, null when it is. Checked
 * beside the fields rather than instead of them, so one submit marks everything
 * that is missing.
 */
export function signUpTermsError(accepted: boolean): string | null {
  return accepted ? null : "Agree to the Terms of Use to create an account";
}
