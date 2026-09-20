/**
 * What may be typed into the one field step one asks for.
 *
 * `POST /auth/login` and `POST /auth/magic-link` both take `identifier`, which
 * is a username or an email address, and both refuse a body carrying the old
 * `email` key. The rule below is that route's rule, mirrored — see
 * `docs/api/auth.md`, and `lib/magic-link-config` for the other place this
 * client writes down a contract it does not own.
 *
 * Mirrored rather than relaxed, because the two ends disagreeing is invisible
 * from either one: a value this screen accepts and the API refuses comes back
 * as a `422` on a field the person cannot see, and a value this screen refuses
 * and the API would have taken is an account that cannot sign in at all.
 *
 * What it deliberately does not do is decide whether the identifier belongs to
 * anybody. Nothing on step one may ask that — see `lib/sign-in-steps`.
 */

/**
 * The full-address test, which is `AppHelpers.detectInputType`'s. `lib/email`
 * holds the same expression for the same reason and is left alone: it answers a
 * different question, whether something is worth mailing, and collapsing the two
 * would tie this contract to that judgement.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The bounds the API's `username.helper.ts` generates within and validates against. */
const USERNAME = /^[a-zA-Z0-9_]*$/;
const USERNAME_MAX = 20;

/** Applies to both branches, so a long paste reports length rather than shape. */
const IDENTIFIER_MAX = 255;

/**
 * The API's own two messages. The branch message is deliberately one sentence
 * for both branches: telling somebody their username was read as a malformed
 * address explains this client's routing rather than their mistake.
 */
export const IDENTIFIER_REQUIRED_NOTICE = "Enter your username or email address";
export const IDENTIFIER_INVALID_NOTICE =
  "Enter a valid username or email address";

/**
 * Which route a value will take, for a caller that needs to say something
 * different about each. Read on the full-address pattern, which is how the API
 * routes — not on a bare `@`, which is how it validates.
 */
export type IdentifierKind = "email" | "username";

export function identifierKind(identifier: string): IdentifierKind {
  return EMAIL.test(identifier.trim()) ? "email" : "username";
}

/**
 * What is wrong with this identifier, or null when nothing is.
 *
 * Validation branches on a bare `@` while routing branches on the whole
 * pattern, which is the API's arrangement and not an oversight in it: a value
 * like `ada@example` is refused here as a malformed address, so it never
 * reaches the username route carrying an `@` that route would not accept.
 */
export function identifierError(identifier: string): string | null {
  const trimmed = identifier.trim();

  if (trimmed === "") return IDENTIFIER_REQUIRED_NOTICE;
  if (trimmed.length > IDENTIFIER_MAX) return IDENTIFIER_INVALID_NOTICE;

  if (trimmed.includes("@")) {
    return EMAIL.test(trimmed) ? null : IDENTIFIER_INVALID_NOTICE;
  }

  if (trimmed.length > USERNAME_MAX) return IDENTIFIER_INVALID_NOTICE;

  return USERNAME.test(trimmed) ? null : IDENTIFIER_INVALID_NOTICE;
}

/**
 * The value to send, which is trimmed and lower-cased.
 *
 * Both ends do this, and doing it here as well is what keeps what somebody sees
 * confirmed back to them — the address on the link-sent step — the same string
 * the link was actually asked for under.
 */
export function normaliseIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}
