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
  signInWithGoogle as startGoogleSignIn,
  signInWithPassword,
  signOut as endSession,
  verifyMagicLink as spendMagicLink,
} from "@/lib/auth-service";
import { googleAuthEvent } from "@/lib/google-auth";

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
   * Pick a Google account and sign in with it. Drives the same events again.
   *
   * Resolves true when an attempt was actually made, and false when the account
   * sheet was dismissed. The screen needs the difference: a dismissed sheet
   * changes nothing at all, so anything it would otherwise tidy away on the way
   * into an attempt — a standing message about a control someone pressed
   * earlier — has to survive it.
   */
  signInWithGoogle: () => Promise<boolean>;
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

  /**
   * The third way in, and the same guard again. The event it ends on is chosen
   * by `googleAuthEvent` rather than here, so there is one place where a Google
   * outcome becomes an auth fact and it is a pure function with a test file.
   *
   * `submit` is dispatched *after* the account sheet rather than before it,
   * which is the one place this differs from the other two. The other two have
   * something in hand the moment they start; this one may come back with
   * nothing, and a `submit` already dispatched cannot be taken back — it has
   * discarded whatever notice was standing, so a dismissed sheet would silently
   * sweep away the sentence explaining a session that had just expired. The
   * double-submit guard does not depend on the machine here: `submitting.current`
   * is already held, and the account sheet is modal anyway.
   */
  const signInWithGoogle = useCallback(async () => {
    if (submitting.current) return false;
    submitting.current = true;

    try {
      const event = googleAuthEvent(await startGoogleSignIn());
      // Null is a dismissed sheet: not an attempt, so there is nothing to
      // announce and nothing on the screen to disturb.
      if (!event) return false;

      // Both in one turn. The reducer applies them in order against its own
      // state, so `settled` arrives while the machine is submitting, which is
      // the only state it accepts one from.
      dispatch({ type: "submit" });
      dispatch(event);
      return true;
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
    () => ({
      state,
      signIn,
      verifyMagicLink,
      signInWithGoogle,
      requestMagicLink,
      signOut,
      retry,
    }),
    [
      state,
      signIn,
      verifyMagicLink,
      signInWithGoogle,
      requestMagicLink,
      signOut,
      retry,
    ],
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
