/**
 * The three screens sign-in is, and what moves between them.
 *
 * The web client's shape, mirrored (`login-form.tsx`, `type LoginStep`): the
 * identifier is asked for alone, the password follows it, and a link that was
 * asked for instead gets a screen of its own rather than a line of text under a
 * button somebody has already left.
 *
 * Held here rather than in the screen for the reason `lib/magic-link-route`
 * exists: what is worth being sure about is not the flag, it is that step one
 * cannot make a request, that every later step can get back, and that the
 * address confirmed on the last one is the address the link was asked for.
 */

export type SignInStep =
  /** The identifier, and Google. The only step that offers another way in. */
  | "identifier"
  /** The password, and the offer of a link instead. */
  | "password"
  /** A link has gone. Says where, and offers another. */
  | "link-sent";

export const FIRST_STEP: SignInStep = "identifier";

export const STEP_COPY: Record<
  SignInStep,
  { title: string; description: string }
> = {
  identifier: {
    title: "Welcome back",
    description: "Sign in to access your queue and chats",
  },
  password: {
    title: "Enter your password",
    description: "One more step and you are in.",
  },
  "link-sent": {
    title: "Check your email",
    description: "We sent you a link that signs you in. No password needed.",
  },
};

/**
 * Whether this step may start a request against the identifier.
 *
 * Step one may not, and this is the load-bearing rule of the whole flow rather
 * than a detail of it. The API refuses to say whether an account exists — one
 * `401` for a wrong password, an unknown email and an unknown username alike, a
 * `200` for a magic link to a username that matches nothing, and a per-subject
 * budget charged before the username lookup so a real identifier and an unknown
 * one cannot be told apart by which starts answering `429`. A step that
 * branched on *is this a new person* would need the oracle all three of those
 * exist to deny, so step one advances for everybody and the password attempt or
 * the link is what answers it.
 */
export function stepMayAsk(step: SignInStep): boolean {
  return step !== "identifier";
}

/**
 * Where back goes, or null when there is nowhere behind this step.
 *
 * `link-sent` returns to the password step rather than to the identifier,
 * because the address is not what somebody is reconsidering when they have just
 * been told a link went to it — and the identifier is one further tap away from
 * there, which is the order the web client puts them in too.
 */
export function previousStep(step: SignInStep): SignInStep | null {
  switch (step) {
    case "identifier":
      return null;
    case "password":
      return "identifier";
    case "link-sent":
      return "password";
  }
}

/**
 * Whether the identifier is shown as a row that is itself the way back.
 *
 * True on every step that no longer asks for it, which is what stops the value
 * being something somebody has to remember they typed.
 */
export function showsIdentifierRow(step: SignInStep): boolean {
  return step !== "identifier";
}
