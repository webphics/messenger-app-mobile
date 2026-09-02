import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import {
  authTransition,
  INITIAL_AUTH_STATE,
  type AuthState,
} from "@/lib/auth-machine";
import type { MagicLinkRequestOutcome } from "@/lib/auth-response";
import {
  hydrateAuth,
  onSessionExpired,
  requestMagicLink as sendMagicLink,
  signInWithPassword,
  signOut as endSession,
  verifyMagicLink as spendMagicLink,
} from "@/lib/auth-service";

/**
 * The only place the auth state machine is driven.
 *
 * The reducer is `authTransition` verbatim — no extra branches, no I/O — so the
 * table tests in `lib/auth-machine.test.ts` describe what this provider actually
 * does. Everything asynchronous happens in `lib/auth-service` and comes back as
 * an event.
 */

type AuthContextValue = {
  state: AuthState;
  /** Resolves once the attempt has settled. Ignored while one is already in flight. */
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Spend a magic link's token. Drives the same events as `signIn`, because a
   * verified link and an accepted password are the same fact.
   */
  verifyMagicLink: (token: string) => Promise<void>;
  /**
   * Ask for a sign-in link. Deliberately outside the state machine: no session
   * is established or refused, so the screen owns the outcome and the answer is
   * returned rather than dispatched.
   */
  requestMagicLink: (email: string) => Promise<MagicLinkRequestOutcome>;
  signOut: () => Promise<void>;
  /** Try hydration again after an Unreachable cold start. */
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authTransition, INITIAL_AUTH_STATE);

  /**
   * The double-submit guard's first half. The machine is the second: it ignores a
   * `submit` that does not come from the sign-in screen. This ref exists because
   * two taps in the same tick both read the pre-dispatch state, so the machine
   * alone would let the second one through and fire a second request.
   */
  const submitting = useRef(false);

  useEffect(() => {
    if (state.status !== "hydrating") return;

    let live = true;
    void hydrateAuth().then((outcome) => {
      if (live) dispatch({ type: "hydrated", outcome });
    });

    return () => {
      live = false;
    };
  }, [state.status]);

  /**
   * The other way a session ends. `lib/auth-service` has already discarded the
   * credential by the time this runs — all that is left is to say so, which is
   * what stops screens rendering empty states with nothing to explain them.
   */
  useEffect(() => onSessionExpired(() => dispatch({ type: "expired" })), []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (submitting.current) return;
    submitting.current = true;
    dispatch({ type: "submit" });

    try {
      dispatch({ type: "settled", outcome: await signInWithPassword(email, password) });
    } finally {
      submitting.current = false;
    }
  }, []);

  /**
   * The same three lines as `signIn`, and the same guard, because the machine
   * cannot tell the two apart and should not: one event stream, one place a
   * second attempt is refused, one set of table tests describing both.
   */
  const verifyMagicLink = useCallback(async (token: string) => {
    if (submitting.current) return;
    submitting.current = true;
    dispatch({ type: "submit" });

    try {
      dispatch({ type: "settled", outcome: await spendMagicLink(token) });
    } finally {
      submitting.current = false;
    }
  }, []);

  const requestMagicLink = useCallback(
    (email: string) => sendMagicLink(email),
    [],
  );

  const signOut = useCallback(async () => {
    // Dispatched first: the person is signed out from this moment, whatever the
    // server says, and an in-flight sign-in can no longer sign them back in.
    dispatch({ type: "sign-out" });
    await endSession();
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: "retry" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, verifyMagicLink, requestMagicLink, signOut, retry }),
    [state, signIn, verifyMagicLink, requestMagicLink, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return value;
}
