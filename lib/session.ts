import type { SessionUser, UserRole } from "@/lib/types";

/**
 * The signed-in person, readable without a hook.
 *
 * `AuthProvider` owns this and writes to it on every auth transition; screens and
 * plain helpers such as `getDevUser()` read it. It is a mirror, never a source:
 * nothing here persists, and nothing here can change a role. The role arrives on
 * the API's session payload and this module only repeats it.
 *
 * It is not reactive. A component reading `getSession()` during render does not
 * re-render when the value changes — today that is safe only because every
 * transition is followed by a navigation that remounts the screens reading it.
 * Anything that has to *observe* identity changing in place must read
 * `useAuth().state` instead; `components/settings/settings-screen.tsx` does.
 */

let current: SessionUser | null = null;

export type SessionSnapshot = {
  email: string | null;
  name: string | null;
  /**
   * Falls back to `customer` while signed out so role-shaped reads have something
   * to render. Nothing is visible in that state — the router is on the sign-in
   * screen — so the fallback is a placeholder, not an authorisation decision.
   */
  role: UserRole;
};

export function getSession(): SessionSnapshot {
  return {
    email: current?.email ?? null,
    name: current?.name ?? null,
    role: current?.role ?? "customer",
  };
}

export function getSessionUser(): SessionUser | null {
  return current;
}

export function setSessionUser(user: SessionUser | null): void {
  current = user;
}

export function isLoggedIn(): boolean {
  return current !== null;
}
