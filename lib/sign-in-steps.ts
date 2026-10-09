import type { AccountState } from "@/lib/account-state";

/**
 * The four screens sign-in is, and what moves between them.
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
  /** Whatever this identifier's account needs: a password, or a link. */
  | "credentials"
  /**
   * The identifier matched no account. Asks who the person is before the link
   * that creates the account goes out, so it arrives with a name and a username.
   */
  | "sign-up"
  /** A link has gone. Says where, and offers another. */
  | "link-sent";

/** Which request the link on `link-sent` came from, so resending and going back repeat it. */
export type LinkPurpose = "sign-in" | "sign-up";

/** The step an answered probe leads to. */
export function stepForAccount(state: AccountState): "credentials" | "sign-up" {
  return state.exists ? "credentials" : "sign-up";
}

export const FIRST_STEP: SignInStep = "identifier";

/**
 * Which of two things the credentials step is about. An identifier with no
 * account never reaches it: `stepForAccount` sends it to `sign-up`.
 */
export type CredentialsMode = "password" | "no-password";

export function credentialsMode(state: AccountState): CredentialsMode {
  return state.hasPassword ? "password" : "no-password";
}

/** Whether step two draws a password field at all. */
export function showsPasswordField(mode: CredentialsMode): boolean {
  return mode === "password";
}

export const STEP_COPY: Record<
  "identifier" | "sign-up" | "link-sent" | "sign-up-link-sent",
  { title: string; description: string }
> = {
  identifier: {
    title: "Welcome back",
    description: "Sign in to access your queue and chats",
  },
  "sign-up": {
    title: "Let's get you started",
    description:
      "No account uses this yet. Tell us who you are and we'll email you a link that creates it.",
  },
  "link-sent": {
    title: "Check your email",
    description: "We sent you a link that signs you in. No password needed.",
  },
  "sign-up-link-sent": {
    title: "Check your email",
    description: "We sent you a link that creates your account and signs you in.",
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
};

/**
 * Where back goes, or null when there is nowhere behind this step.
 *
 * `link-sent` returns to the step that sent the link rather than to the
 * identifier, because the address is not what somebody is reconsidering when
 * they have just been told a link went to it.
 */
export function previousStep(
  step: SignInStep,
  linkPurpose: LinkPurpose = "sign-in",
): SignInStep | null {
  switch (step) {
    case "identifier":
      return null;
    case "credentials":
    case "sign-up":
      return "identifier";
    case "link-sent":
      return linkPurpose === "sign-up" ? "sign-up" : "credentials";
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
