/**
 * Is this shaped enough like an address to be worth sending?
 *
 * The bar is deliberately low. It exists to catch the typo that would have the
 * API answer "no such account" for a string that was never an address, and to
 * decide when the sign-in screen may enable a request — not to rule on what a
 * valid address is, which is a question this client has no business answering.
 *
 * This module used to judge passwords too: rules, a strength meter, and a
 * generator, all for the registration screen that #22 removed. They went with
 * it. Password shape is the server's rule, and a client that enforced its own
 * would lock out an account that met the rules when it was created.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailLooksValid(email: string): boolean {
  return EMAIL_RE.test(email)
}
