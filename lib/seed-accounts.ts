import { emailLooksValid } from "@/lib/email";
import type { UserRole } from "@/lib/types";

/**
 * The seed accounts a development build offers to sign in as.
 *
 * This is what is left of the Settings role switcher. That control set the
 * session's role from the client, which server-owned roles make a lie — and a
 * lie of the worst shape, a privilege affordance that looks like it grants
 * access and does not. What survives is the shape, not the power: picking here
 * fills the sign-in form with a *different account's* credentials, and the role
 * that comes back is whatever the server says that account holds. Nothing on
 * this path can assert a role, because the only thing it sends is a password.
 *
 * Configured rather than written down, for the reason the API's own seeder gives
 * for reading its Admin from the environment: a literal password in source ships
 * every build with the same known login. Here it never reaches a shipped build
 * at all — `SEED_ACCOUNTS` below is behind `__DEV__`, which Metro replaces with
 * `false` for a release bundle and then eliminates the branch, taking the
 * inlined `process.env.EXPO_PUBLIC_*` string with it.
 */

export type SeedAccount = {
  /**
   * The role this account is *expected* to hold, used to label the control.
   * A guess about the server's answer, never an instruction to it: the session
   * that arrives carries the role the server assigned, and if the two disagree
   * the server is right and the label is stale.
   */
  role: UserRole;
  email: string;
  password: string;
};

const ROLES: UserRole[] = ["customer", "agent", "admin"];

function isRole(value: string): value is UserRole {
  return (ROLES as string[]).includes(value);
}

/**
 * Parse `role:email:password` entries, comma-separated.
 *
 * Only the first two colons separate fields, so a password may contain one; a
 * password may not contain a comma, which is the price of a one-line variable
 * and is documented in `.env.example`.
 *
 * An unusable entry is dropped rather than thrown on. This is read at import on
 * the way to the sign-in screen, and a typo in a development convenience must
 * not be the reason nobody can sign in at all — including with a password they
 * typed themselves. What a dropped entry costs is one missing chip, which is
 * visible at a glance on the screen it belongs to.
 */
export function readSeedAccounts(raw: string | undefined): SeedAccount[] {
  const accounts: SeedAccount[] = [];
  const claimed = new Set<UserRole>();

  for (const entry of (raw ?? "").split(",")) {
    const firstColon = entry.indexOf(":");
    const secondColon = entry.indexOf(":", firstColon + 1);
    if (firstColon === -1 || secondColon === -1) continue;

    const role = entry.slice(0, firstColon).trim();
    const email = entry.slice(firstColon + 1, secondColon).trim();
    const password = entry.slice(secondColon + 1).trim();

    if (!isRole(role) || !emailLooksValid(email) || password === "") continue;
    // One chip per role: two accounts under the same label are two controls that
    // read identically and do different things.
    if (claimed.has(role)) continue;

    claimed.add(role);
    accounts.push({ role, email, password });
  }

  return accounts;
}

const LABEL_BY_ROLE: Record<UserRole, string> = {
  customer: "Customer",
  agent: "Agent",
  admin: "Admin",
};

/**
 * What the chip for a seed account says.
 *
 * The API's own role names rather than this app's hub chrome (`hubEyebrow` calls
 * the customer surface SUPPORT), because the point of the control is to name the
 * account you are about to sign in as, and the server answers in these words.
 */
export function seedAccountLabel(role: UserRole): string {
  return LABEL_BY_ROLE[role];
}

/**
 * Empty in anything but a development build, and empty there too until the
 * variable is set.
 *
 * This `__DEV__` is the only guard the feature has, and the only one it needs:
 * every caller renders from this list, so an empty list is an absent control.
 * Read literally, never through a computed key — Metro inlines
 * `process.env.EXPO_PUBLIC_*` by textual substitution at build time, so
 * `process.env[name]` is `undefined` in a bundle, and the same substitution is
 * what puts these credentials in one eliminable branch rather than in the app.
 */
export const SEED_ACCOUNTS: SeedAccount[] = __DEV__
  ? readSeedAccounts(process.env.EXPO_PUBLIC_DEV_SEED_ACCOUNTS)
  : [];
