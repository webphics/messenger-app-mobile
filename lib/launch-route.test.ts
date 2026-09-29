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

const EVERY_FETCH: ConversationFetch[] = ["outstanding", "answered", "failed", "abandoned"];
const SETTLED: ConversationFetch[] = ["answered", "failed", "abandoned"];
const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };

describe("the outcomes of a launch", () => {
  test("signed in goes to the Hub for the role the server gave", () => {
    expect(launchDestination(signedIn("admin"), "answered")).toEqual({
      kind: "navigate",
      href: ROLE_HREF.admin,
    });
  });

  test("a Stale session has a Hub and is never the Unreachable screen", () => {
    for (const fetch of SETTLED) {
      expect(launchDestination(stale("customer"), fetch)).toEqual({
        kind: "navigate",
        href: ROLE_HREF.customer,
      });
    }
  });

  test("signed out and a sign-in in flight go to sign-in, without waiting on a fetch", () => {
    expect(launchDestination(SIGNED_OUT, "outstanding")).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
    expect(launchDestination({ status: "submitting" }, "answered")).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });

  test("unreachable stays on the launch screen whatever the fetch has done", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination({ status: "unreachable" }, fetch)).toEqual({
        kind: "unreachable",
      });
    }
  });

  test("hydration still running waits whatever the fetch has done", () => {
    for (const fetch of EVERY_FETCH) {
      expect(launchDestination({ status: "hydrating" }, fetch)).toEqual({ kind: "wait" });
    }
  });
});

describe("the first Conversation fetch", () => {
  test("a signed-in launch, Stale included, waits while it is outstanding", () => {
    expect(launchDestination(signedIn("agent"), "outstanding")).toEqual({ kind: "wait" });
    expect(launchDestination(stale("agent"), "outstanding")).toEqual({ kind: "wait" });
  });

  test("a failed or abandoned fetch releases the launch exactly as an answered one", () => {
    for (const fetch of ["failed", "abandoned"] as const) {
      expect(launchDestination(signedIn("agent"), fetch)).toEqual(
        launchDestination(signedIn("agent"), "answered"),
      );
    }
  });
});

describe("a notification tapped for a thread", () => {
  const THREAD = "cnv_01";

  test("signed in and settled opens the thread over the Hub", () => {
    for (const fetch of SETTLED) {
      expect(launchDestination(signedIn("agent"), fetch, THREAD)).toEqual({
        kind: "navigate",
        href: chatHref(THREAD),
        behind: ROLE_HREF.agent,
      });
    }
  });

  test("still waits for the fetch", () => {
    expect(launchDestination(signedIn("agent"), "outstanding", THREAD)).toEqual({
      kind: "wait",
    });
  });

  test("signed out goes to sign-in and names no thread", () => {
    expect(launchDestination(SIGNED_OUT, "answered", THREAD)).toEqual({
      kind: "navigate",
      href: SIGN_IN_HREF,
    });
  });

  test("unreachable stays unreachable, keeping the intent", () => {
    expect(launchDestination({ status: "unreachable" }, "answered", THREAD)).toEqual({
      kind: "unreachable",
    });
  });
});

describe("an account with no name", () => {
  const nameless = (isStale = false): AuthState => ({
    status: "signed-in",
    user: { ...AGENT, name: "" },
    stale: isStale,
  });

  test("is sent to onboarding, Stale or not, and ahead of a tapped notification", () => {
    const onboarding = { kind: "navigate", href: ONBOARDING_HREF };
    expect(launchDestination(nameless(), "answered")).toEqual(onboarding);
    expect(launchDestination(nameless(true), "failed")).toEqual(onboarding);
    expect(launchDestination(nameless(), "answered", "c-1")).toEqual(onboarding);
  });

  test("still waits for the fetch", () => {
    expect(launchDestination(nameless(), "outstanding")).toEqual({ kind: "wait" });
  });
});
