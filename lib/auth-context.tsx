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
import { AppState } from "react-native";

import {
  authTransition,
  INITIAL_AUTH_STATE,
  type AuthState,
} from "@/lib/auth-machine";
import type { AuthOutcome, MagicLinkRequestOutcome } from "@/lib/auth-response";
import {
  confirmSession,
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
   *
   * `name` names the account the link would create, and is ignored for one that
   * already exists -- see `requestMagicLink` in `lib/auth-service`.
   */
  requestMagicLink: (
    email: string,
    name?: string,
  ) => Promise<MagicLinkRequestOutcome>;
  signOut: () => Promise<void>;
  /** Try hydration again after an Unreachable cold start. */
  retry: () => void;
  /**
   * Ask the API to confirm a Stale session, if this one is Stale.
   *
   * A no-op otherwise, so a caller does not have to know which kind of session
   * it is holding — it only has to know that the API just answered something.
   * `RealtimeProvider` is the caller: a socket that connected is this app's one
   * event-shaped proof that the server is reachable again.
   */
  confirmStaleSession: () => void;
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
    void hydrateAuth().then((result) => {
      if (live) dispatch({ type: "hydrated", ...result });
    });

    return () => {
      live = false;
    };
  }, [state.status]);

  /** Whether a confirmation is already out. Two would ask the same question twice. */
  const confirming = useRef(false);

  const stale = state.status === "signed-in" && state.stale;

  /**
   * Read by `confirmStaleSession`, which is stable and therefore cannot close
   * over the render's value. Synced in an effect declared before the one that
   * calls it, so the first confirmation of a Stale session sees `true`.
   */
  const staleNow = useRef(false);
  useEffect(() => {
    staleNow.current = stale;
  }, [stale]);

  /**
   * Ask the API who this is, when this session is one nobody has confirmed.
   *
   * Stable, because the socket effect that calls it must not be torn down and
   * rebuilt every time this changes — which is why the flag is read from a ref
   * rather than closed over. Guarded twice: a session that is not Stale has
   * nothing to confirm, and a confirmation already out is not asked twice.
   *
   * `confirmSession` goes out as an authenticated request, so the answer this
   * function cannot see is the one that matters most: a cookie that expired
   * while there was no signal ends the session the ordinary way, through the
   * expiry listener below, rather than through anything here.
   */
  const confirmStaleSession = useCallback(() => {
    if (!staleNow.current || confirming.current) return;
    confirming.current = true;

    void confirmSession()
      .then((outcome) => {
        // Anything else leaves the session exactly as it is: still signed in,
        // still unconfirmed, still drawing what this device holds.
        if (outcome?.kind === "signed-in") {
          dispatch({ type: "confirmed", user: outcome.user });
        }
      })
      .finally(() => {
        confirming.current = false;
      });
  }, []);

  /**
   * The two moments this provider can see for itself.
   *
   * Once on the way in, because the launch that produced a Stale session may
   * have raced a network that came back a second later; and then on every
   * return to the foreground, because that is what a phone coming out of a
   * pocket looks like from in here. The third moment — the network itself
   * coming back while the app is open — is the socket's, and it calls
   * `confirmStaleSession` directly. No timer and no retry loop: a Stale session
   * is a working session, so there is nothing to poll for.
   */
  useEffect(() => {
    if (!stale) return;

    confirmStaleSession();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") confirmStaleSession();
    });

    return () => {
      subscription.remove();
    };
  }, [stale, confirmStaleSession]);

  /**
   * The other way a session ends. `lib/auth-service` has already discarded the
   * credential by the time this runs — all that is left is to say so, which is
   * what stops screens rendering empty states with nothing to explain them.
   */
  useEffect(() => onSessionExpired(() => dispatch({ type: "expired" })), []);

  /**
   * Run one attempt at establishing a session, whatever it is an attempt at.
   *
   * A password and a verified link are the same fact to the machine, so they are
   * the same three dispatches here: submit, await, settle. Written once because
   * two copies would be two places for the double-submit guard to be got wrong,
   * and the table tests in `lib/auth-machine.test.ts` describe one event stream.
   *
   * Google is not routed through this: its `submit` has to wait until the
   * account sheet has actually returned something. See `signInWithGoogle`.
   */
  const runAttempt = useCallback(async (attempt: () => Promise<AuthOutcome>) => {
    if (submitting.current) return;
    submitting.current = true;
    dispatch({ type: "submit" });

    try {
      dispatch({ type: "settled", outcome: await attempt() });
    } finally {
      submitting.current = false;
    }
  }, []);

  const signIn = useCallback(
    (email: string, password: string) =>
      runAttempt(() => signInWithPassword(email, password)),
    [runAttempt],
  );

  const verifyMagicLink = useCallback(
    (token: string) => runAttempt(() => spendMagicLink(token)),
    [runAttempt],
  );

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
    (email: string, name?: string) => sendMagicLink(email, name),
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
      confirmStaleSession,
    }),
    [
      state,
      signIn,
      verifyMagicLink,
      signInWithGoogle,
      requestMagicLink,
      signOut,
      retry,
      confirmStaleSession,
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
