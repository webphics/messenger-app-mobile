import type { AuthState } from "@/lib/auth-machine";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import { launchDestination } from "@/lib/launch-route";
import type { ConversationFetch, SessionUser, UserRole } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
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

const EVERY_FETCH: ConversationFetch[] = ["outstanding", "answered", "failed"];
const SETTLED: ConversationFetch[] = ["answered", "failed"];

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
  test("hydration still running holds the launch animation", () => {
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
 * a Customer — and leaving on the animation's own schedule hands over a Hub that
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

  test("still outstanding holds the animation, in every role", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role), "outstanding")).toEqual({
        kind: "wait",
      });
    }
  });

  // Settled means answered *or* failed. With the Store there is something to
  // draw either way, and holding an animation open on a bad network is the
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
  // back into the launch animation and take away the one control on it.
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
