import type { AuthState } from "@/lib/auth-machine";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import { launchDestination } from "@/lib/launch-route";
import type { SessionUser, UserRole } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
};

const signedIn = (role: UserRole): AuthState => ({
  status: "signed-in",
  user: { ...AGENT, role },
});

describe("the three Hydration outcomes", () => {
  test("signed in goes to the Hub for the role the server gave", () => {
    const roles: UserRole[] = ["customer", "agent", "admin"];
    for (const role of roles) {
      expect(launchDestination(signedIn(role))).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
  });

  test("signed out goes to sign-in", () => {
    expect(launchDestination({ status: "signed-out", notice: null })).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });

  test("a notice left by a refused sign-in does not change where signed out goes", () => {
    expect(
      launchDestination({ status: "signed-out", notice: "Wrong password." }),
    ).toEqual({ kind: "navigate", href: SIGN_IN_HREF });
  });

  // The whole reason this ticket exists on its own: an API that did not answer
  // must not be read as a session that ended.
  test("unreachable stays on the launch screen rather than routing anywhere", () => {
    expect(launchDestination({ status: "unreachable" })).toEqual({
      kind: "unreachable",
    });
    expect(launchDestination({ status: "unreachable" })).not.toEqual(
      launchDestination({ status: "signed-out", notice: null }),
    );
  });
});

describe("states that are not an outcome yet", () => {
  test("hydration still running holds the launch animation", () => {
    expect(launchDestination({ status: "hydrating" })).toEqual({ kind: "wait" });
  });

  // Only ever reachable from the sign-in screen, which is where a submit comes
  // from — so if the launch screen is somehow still up, that is where to send it.
  test("a sign-in in flight routes to sign-in", () => {
    expect(launchDestination({ status: "submitting" })).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
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
    const before = JSON.stringify(state);
    const destination = launchDestination(state);
    expect(["wait", "navigate", "unreachable"]).toContain(destination.kind);
    expect(JSON.stringify(state)).toBe(before);
  }
});
