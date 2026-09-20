import type { AccountState } from "@/lib/account-state";

/**
 * The three screens sign-in is, and what moves between them.
 *
 * The web client's shape, mirrored (`login-form.tsx`, `type LoginStep`): the
 * identifier is asked for alone, what it turns out to need follows it, and a
 * link that was asked for instead gets a screen of its own.
 *
 * **Step one now makes a request, and it did not used to.** This module was
 * written on the premise that it could not: the API refused to say whether an
 * account existed — one `401` for a wrong password, an unknown email and an
 * unknown username alike, a `200` for a link to a username that matched
 * nothing, and a per-subject budget charged before the username lookup so the
 * two could not be told apart by which started answering `429` — so a step that
 * branched on *is this a new person* would have needed an oracle three separate
 * defences existed to deny.
 *
 * `POST /auth/account-state` is that oracle, added deliberately, and the API's
 * schema gives the reason: **drawing the controls is itself the disclosure.** A
 * second step with no password field says the address has no password whatever
 * the payload withheld, so the choice was never between telling and not telling
 * — it was between telling for free and telling under a budget. The route is
 * rate limited per identifier and per IP, and answers two booleans carrying
 * nothing else off the row.
 *
 * The rest of the enumeration defences are untouched. `POST /auth/login` still
 * answers one `401` for every kind of wrong, and the magic-link route still
 * reports a link it never sent for an unknown username.
 */

export type SignInStep =
  /** The identifier, and Google. The only step that offers another way in. */
  | "identifier"
  /** Whatever this identifier actually needs: a password, or a link. */
  | "credentials"
  /** A link has gone. Says where, and offers another. */
  | "link-sent";

export const FIRST_STEP: SignInStep = "identifier";

/**
 * Which of three things step two is about.
 *
 * Only the first is about a password. The other two draw the same controls and
 * are worded apart because "your account has no password" and "you have no
 * account" are different news, and one line covering both would be vague enough
 * to be useless to either person.
 */
export type CredentialsMode = "password" | "no-password" | "new-account";

export function credentialsMode(state: AccountState): CredentialsMode {
  if (!state.exists) return "new-account";

  return state.hasPassword ? "password" : "no-password";
}

/** Whether step two draws a password field at all. */
export function showsPasswordField(mode: CredentialsMode): boolean {
  return mode === "password";
}

export const STEP_COPY: Record<
  "identifier" | "link-sent",
  { title: string; description: string }
> = {
  identifier: {
    title: "Welcome back",
    description: "Sign in to access your queue and chats",
  },
  "link-sent": {
    title: "Check your email",
    description: "We sent you a link that signs you in. No password needed.",
  },
};

export const CREDENTIALS_COPY: Record<
  CredentialsMode,
  { title: string; description: string }
> = {
  password: {
    title: "Enter your password",
    description: "One more step and you are in.",
  },
  "no-password": {
    title: "Check your email instead",
    description:
      "This account has no password. We can email you a link that signs you in.",
  },
  "new-account": {
    title: "Let's get you started",
    description: "No account uses this address yet. A sign-in link will create one.",
  },
};

/**
 * Where back goes, or null when there is nowhere behind this step.
 *
 * `link-sent` returns to the credentials step rather than to the identifier,
 * because the address is not what somebody is reconsidering when they have just
 * been told a link went to it.
 */
export function previousStep(step: SignInStep): SignInStep | null {
  switch (step) {
    case "identifier":
      return null;
    case "credentials":
      return "identifier";
    case "link-sent":
      return "credentials";
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
