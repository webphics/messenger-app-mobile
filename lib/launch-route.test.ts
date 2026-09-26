import type { AuthState } from "@/lib/auth-machine";
import { chatHref } from "@/lib/chat-route-id";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import { launchDestination } from "@/lib/launch-route";
import { ONBOARDING_HREF } from "@/lib/onboarding-gate";
import type { ConversationFetch, SessionUser, UserRole } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  hasPassword: true,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
};

const signedIn = (role: UserRole): AuthState => ({
  status: "signed-in",
  user: { ...AGENT, role },
  stale: false,
});

/** The same person on a launch that could not reach the API. See #50. */
const stale = (role: UserRole): AuthState => ({
  status: "signed-in",
  user: { ...AGENT, role },
  stale: true,
});

const EVERY_FETCH: ConversationFetch[] = [
  "outstanding",
  "answered",
  "failed",
  "abandoned",
];
const SETTLED: ConversationFetch[] = ["answered", "failed", "abandoned"];

/**
 * The mistake this module exists to prevent, in its newer form.
 *
 * Unreachable is not a route, and a Stale session is not Unreachable: it has a
 * person, so it has a Hub, and sending it to the launch screen's retry button
 * would put a *Try again* in front of Conversations this device is already
 * holding — which is the whole of #50.
 */
describe("a Stale session", () => {
  test("goes to the Hub for the role this device last heard", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(stale(role), "answered")).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
  });

  test("a list that could not be fetched still hands over — that is the airplane-mode launch", () => {
    // The fetch failed because the same network that made the session Stale is
    // still down. There are Restored rows behind this, so the Hub is the honest
    // screen; waiting for an answer that is not coming is not.
    expect(launchDestination(stale("agent"), "failed")).toEqual({
      kind: "navigate",
      href: ROLE_HREF.agent,
    });
  });

  test("waits for the list like any other session, rather than arriving empty", () => {
    expect(launchDestination(stale("agent"), "outstanding")).toEqual({ kind: "wait" });
  });

  test("is never the Unreachable screen", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination(stale("customer"), fetch)).not.toEqual({
        kind: "unreachable",
      });
    }
  });
});

describe("the three Hydration outcomes", () => {
  test("signed in goes to the Hub for the role the server gave", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "answered")).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
  });

  test("signed out goes to sign-in", () => {
    expect(
      launchDestination({ status: "signed-out", notice: null }, "answered"),
    ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
  });

  test("a notice left by a refused sign-in does not change where signed out goes", () => {
    expect(
      launchDestination(
        { status: "signed-out", notice: "Wrong password." },
        "answered",
      ),
    ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
  });

  // The whole reason this ticket exists on its own: an API that did not answer
  // must not be read as a session that ended.
  test("unreachable stays on the launch screen rather than routing anywhere", () => {
    expect(launchDestination({ status: "unreachable" }, "answered")).toEqual({
      kind: "unreachable",
    });
    expect(
      launchDestination({ status: "unreachable" }, "answered"),
    ).not.toEqual(
      launchDestination({ status: "signed-out", notice: null }, "answered"),
    );
  });
});

describe("states that are not an outcome yet", () => {
  test("hydration still running holds the launch screen", () => {
    expect(launchDestination({ status: "hydrating" }, "answered")).toEqual({
      kind: "wait",
    });
  });

  // Only ever reachable from the sign-in screen, which is where a submit comes
  // from — so if the launch screen is somehow still up, that is where to send it.
  test("a sign-in in flight routes to sign-in", () => {
    expect(launchDestination({ status: "submitting" }, "answered")).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });
});

/**
 * The second half of the gate. Hydration settling is no longer enough: for a
 * signed-in person the Conversations are fetched *after* it — three requests for
 * a Customer — and leaving as soon as Hydration settles hands over a Hub that
 * fills in underneath them a moment later.
 */
describe("the first Conversation fetch", () => {
  test("answered and signed in leaves for the Hub", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "answered")).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
  });

  test("still outstanding holds the launch screen, in every role", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "outstanding")).toEqual({
        kind: "wait",
      });
    }
  });

  // Settled means answered *or* failed. With the Store there is something to
  // draw either way, and holding the launch screen open on a bad network is the
  // failure this gate exists to prevent — so a failure releases it too.
  test("a fetch that failed releases it exactly as one that answered", () => {
    expect(launchDestination(signedIn("agent"), "failed")).toEqual(
      launchDestination(signedIn("agent"), "answered"),
    );
    expect(launchDestination(signedIn("agent"), "failed")).toEqual({
      kind: "navigate",
      href: ROLE_HREF.agent,
    });
  });

  // Nobody signed in has a list to fetch, so an outstanding fetch is not a
  // reason to hold either of them.
  test("nothing waits on a fetch that was never made", () => {
    expect(
      launchDestination({ status: "signed-out", notice: null }, "outstanding"),
    ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
    expect(launchDestination({ status: "submitting" }, "outstanding")).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });

  // Unreachable is a screen with a retry on it, not a route, and it must not be
  // folded in with the fetch gate: an outstanding fetch would otherwise turn it
  // back into the launch screen and take away the one control on it.
  test("unreachable is still unreachable whatever the fetch has done", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination({ status: "unreachable" }, fetch)).toEqual({
        kind: "unreachable",
      });
    }
  });

  // Hydration comes first: no session means no fetch to have settled, and the
  // answer is the same whichever it is.
  test("hydration still running holds it whatever the fetch has done", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination({ status: "hydrating" }, fetch)).toEqual({
        kind: "wait",
      });
    }
  });

  test("both halves have to be true, in either order", () => {
    // Hydration first, fetch second.
    expect(launchDestination({ status: "hydrating" }, "answered")).toEqual({
      kind: "wait",
    });
    // Fetch first, Hydration second.
    expect(launchDestination(signedIn("admin"), "outstanding")).toEqual({
      kind: "wait",
    });
    for (const fetch of SETTLED) {
      expect(launchDestination(signedIn("admin"), fetch)).toEqual({
        kind: "navigate",
        href: ROLE_HREF.admin,
      });
    }
  });
});

/**
 * The Launch deadline, as the gate sees it: not a clock here, just a fourth
 * thing the fetch can say. See #52 — the clock is `lib/launch-deadline`, armed
 * by the inbox where the load it bounds actually lives.
 */
describe("a fetch the Launch deadline gave up on", () => {
  // The row the ticket is about. There are Restored rows behind the Hub, and
  // the load that was abandoned lands in them if it ever answers.
  test("hands a signed-in person over rather than holding them", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "abandoned")).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
  });

  test("reads exactly as answered and as failed do", () => {
    expect(launchDestination(signedIn("agent"), "abandoned")).toEqual(
      launchDestination(signedIn("agent"), "answered"),
    );
    expect(launchDestination(signedIn("agent"), "abandoned")).toEqual(
      launchDestination(signedIn("agent"), "failed"),
    );
  });

  test("a Stale session reaches its Hub on it too", () => {
    expect(launchDestination(stale("customer"), "abandoned")).toEqual({
      kind: "navigate",
      href: ROLE_HREF.customer,
    });
  });

  // Unreachable is a screen with a retry on it, not a route: there is no
  // session behind it and so no Hub the deadline could hand over to.
  test("unreachable is still unreachable", () => {
    expect(launchDestination({ status: "unreachable" }, "abandoned")).toEqual({
      kind: "unreachable",
    });
  });

  // Nowhere to send anyone: which Hub is what Hydration was going to say.
  test("hydration still running is still a wait", () => {
    expect(launchDestination({ status: "hydrating" }, "abandoned")).toEqual({
      kind: "wait",
    });
  });

  test("signed out still goes to sign-in", () => {
    expect(
      launchDestination({ status: "signed-out", notice: null }, "abandoned"),
    ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
    expect(launchDestination({ status: "submitting" }, "abandoned")).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });

  // The whole point, as the invariant: past the deadline the gate never holds
  // somebody who has a Hub to be in.
  test("no signed-in state waits on it", () => {
    expect(launchDestination(signedIn("agent"), "abandoned").kind).not.toBe(
      "wait",
    );
    expect(launchDestination(stale("agent"), "abandoned").kind).not.toBe(
      "wait",
    );
  });
});

test("every auth state lands on a destination, and none is mutated", () => {
  const states: AuthState[] = [
    { status: "hydrating" },
    { status: "signed-out", notice: null },
    { status: "signed-out", notice: "Wrong password." },
    { status: "submitting" },
    signedIn("customer"),
    signedIn("agent"),
    signedIn("admin"),
    { status: "unreachable" },
  ];

  for (const state of states) {
    for (const fetch of EVERY_FETCH) {
      const before = JSON.stringify(state);
      const destination = launchDestination(state, fetch);
      expect(["wait", "navigate", "unreachable"]).toContain(destination.kind);
      expect(JSON.stringify(state)).toBe(before);
    }
  }
});

/**
 * The third input: a notification somebody tapped.
 *
 * Deliberately not a second route. The launch already answers where it lands as
 * a function of Hydration and the fetch, and a tap is one more thing that answer
 * has to account for — so the rows below are the existing rows with a thread
 * pending, and all but one of them are unchanged. See #59.
 */
describe("a notification tapped for a thread", () => {
  const THREAD = "cnv_01";
  const threadHref = chatHref(THREAD);

  // The row the ticket is about, and the only one that changes.
  test("signed in and settled opens the thread rather than the Hub", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      for (const fetch of SETTLED) {
        expect(launchDestination(signedIn(role), fetch, THREAD)).toEqual({
          kind: "navigate",
          href: threadHref,
          behind: ROLE_HREF[role],
        });
      }
    }
  });

  /**
   * Back has to leave the thread rather than the app, and a thread pushed onto
   * nothing has nothing to go back to. The Hub is named beside the thread rather
   * than replaced by it for that reason — the wait below is the other half of
   * the same promise.
   */
  test("names the Hub the thread is opened over, for the role the server gave", () => {
    expect(launchDestination(signedIn("agent"), "answered", THREAD)).toMatchObject({
      behind: ROLE_HREF.agent,
    });
    expect(launchDestination(stale("customer"), "answered", THREAD)).toMatchObject({
      behind: ROLE_HREF.customer,
    });
  });

  // The thread Restores from the Store and draws immediately, but the Hub
  // underneath it still has to exist — so a tap buys nothing off the wait.
  test("still waits for the fetch, exactly as a launch with no thread does", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "outstanding", THREAD)).toEqual({
        kind: "wait",
      });
    }
    expect(launchDestination(stale("agent"), "outstanding", THREAD)).toEqual({
      kind: "wait",
    });
    expect(launchDestination({ status: "hydrating" }, "answered", THREAD)).toEqual({
      kind: "wait",
    });
  });

  /**
   * The Session end that took the cookie took the Store the thread would have
   * drawn from, so there is nothing to open. Sign-in, and the intent is dropped
   * rather than held against a session that no longer exists.
   */
  test("signed out goes to sign-in and names no thread", () => {
    for (const fetch of EVERY_FETCH) {
      expect(
        launchDestination({ status: "signed-out", notice: null }, fetch, THREAD),
      ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
      expect(launchDestination({ status: "submitting" }, fetch, THREAD)).toEqual({
        kind: "navigate",
        href: SIGN_IN_HREF,
      });
    }
  });

  /**
   * That cookie is still good, so the intent is worth keeping: this stays the
   * screen with the retry on it, and a retry that reaches the API comes back
   * round to the row above with the same thread pending.
   */
  test("unreachable stays unreachable, and stays distinguishable from signed out", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination({ status: "unreachable" }, fetch, THREAD)).toEqual({
        kind: "unreachable",
      });
    }
    expect(launchDestination({ status: "unreachable" }, "answered", THREAD)).not.toEqual(
      launchDestination({ status: "signed-out", notice: null }, "answered", THREAD),
    );
  });

  /**
   * A dispatch `push-rules` could not read answers null, and null has to be the
   * ordinary launch rather than anything of its own — that is what keeps a
   * malformed payload from being able to break a launch.
   */
  test("no thread is every row exactly as it was", () => {
    const states: AuthState[] = [
      { status: "hydrating" },
      { status: "signed-out", notice: null },
      { status: "submitting" },
      signedIn("customer"),
      signedIn("agent"),
      stale("admin"),
      { status: "unreachable" },
    ];
    for (const state of states) {
      for (const fetch of EVERY_FETCH) {
        expect(launchDestination(state, fetch, null)).toEqual(
          launchDestination(state, fetch),
        );
      }
    }
  });
});

/**
 * The gate #4 of the sign-in rework put in front of every resolved session.
 *
 * A cold start never goes through the sign-in form, so if the gate lived there
 * an account that signed in yesterday and was never asked for a name would walk
 * straight into a Hub today. It is a property of a resolved session rather than
 * of a way in, which is why it is tested on this path as well as on that one.
 */
describe("an account with no name", () => {
  const nameless = (role: UserRole, stale = false): AuthState => ({
    status: "signed-in",
    user: { ...AGENT, role, name: "" },
    stale,
  });

  test("is sent to onboarding rather than to its Hub", () => {
    for (const role of ["customer", "agent", "admin"] as UserRole[]) {
      expect(launchDestination(nameless(role), "answered")).toEqual({
        kind: "navigate",
        href: ONBOARDING_HREF,
      });
    }
  });

  test("including on a Stale session, which is still a session", () => {
    expect(launchDestination(nameless("agent", true), "failed")).toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });

  test("a whitespace name is no name", () => {
    const whitespace: AuthState = {
      status: "signed-in",
      user: { ...AGENT, name: "   " },
      stale: false,
    };
    expect(launchDestination(whitespace, "answered")).toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });

  test("the gate outranks a tapped notification", () => {
    // A thread opened behind onboarding would sit under a form the person
    // cannot leave. Close to unreachable in practice — an account new enough to
    // have no name has nothing to be notified about — but the order must match
    // every other entry point's.
    expect(
      launchDestination(nameless("agent"), "answered", "c-1"),
    ).toEqual({ kind: "navigate", href: ONBOARDING_HREF });
  });

  test("but it still waits for the fetch, like any other signed-in launch", () => {
    // The gate is about where the launch lands, not about skipping the wait
    // that keeps a Hub from arriving half-drawn underneath somebody.
    expect(launchDestination(nameless("agent"), "outstanding")).not.toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });

  test("an account with a name is unaffected", () => {
    expect(launchDestination(signedIn("agent"), "answered")).toEqual({
      kind: "navigate",
      href: ROLE_HREF.agent,
    });
  });
});
