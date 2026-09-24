import { parseSessionUser } from "@/lib/auth-response";
import { ROLE_HREF } from "@/lib/hub-routes";
import {
  ONBOARDING_HREF,
  needsOnboarding,
  signedInDestination,
} from "@/lib/onboarding-gate";
import type { SessionUser } from "@/lib/types";

function person(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "customer",
    hasPassword: true,
    twoFactorEnabled: false,
    supportAssignmentEnabled: false,
    ...overrides,
  };
}

describe("who is asked to finish onboarding", () => {
  test("an account with no name", () => {
    expect(needsOnboarding(person({ name: "" }))).toBe(true);
  });

  test("an account whose name is only whitespace", () => {
    expect(needsOnboarding(person({ name: "   " }))).toBe(true);
  });

  test("an account the API answered null for, which is the link-made one", () => {
    // Typed as a string, but a link that carried no name is exactly the account
    // this gate exists for, so a null must not throw its way past the gate.
    expect(
      needsOnboarding(person({ name: null as unknown as string })),
    ).toBe(true);
  });

  test("an account with a name is not", () => {
    expect(needsOnboarding(person())).toBe(false);
  });

  test("a single character is a name", () => {
    expect(needsOnboarding(person({ name: "A" }))).toBe(false);
  });
});

describe("where a signed-in person lands", () => {
  test("onboarding while the name is blank, whatever the role", () => {
    for (const role of ["customer", "agent", "admin"] as const) {
      expect(signedInDestination(person({ role, name: "" }))).toBe(
        ONBOARDING_HREF,
      );
    }
  });

  test("the role's Hub once it is not", () => {
    expect(signedInDestination(person({ role: "agent" }))).toBe(
      ROLE_HREF.agent,
    );
    expect(signedInDestination(person({ role: "admin" }))).toBe(
      ROLE_HREF.admin,
    );
    expect(signedInDestination(person({ role: "customer" }))).toBe(
      ROLE_HREF.customer,
    );
  });

  test("the gate outranks the role, rather than the role being consulted first", () => {
    // An Admin with no name goes to onboarding, not to the Admin Hub. The web
    // proxy orders it the same way and for the same reason: the name is asked
    // for before anything is shown, not after the role has chosen a screen.
    expect(signedInDestination(person({ role: "admin", name: "" }))).not.toBe(
      ROLE_HREF.admin,
    );
  });
});

/**
 * The tests above build a `SessionUser` by hand, and every one of them passed
 * while this gate was completely broken on a device. `parseSessionUser`
 * substitutes the address for a blank name, so a hand-built `name: ""` is a
 * shape the app never actually holds.
 *
 * These go through the parser instead. Verified against the real thing first: a
 * magic link created an account the API stored as `name: ''`, and the app went
 * to the Hub greeting them by their own address.
 */
describe("through the parser, which is where the substitution lives", () => {
  const payload = (name: unknown) => ({
    id: "e0d3c1a2-0000-4000-8000-000000000000",
    name,
    email: "onboarding-probe@talo.test",
    role: "customer",
  });

  test("the parser really does substitute the address — the premise of this gate", () => {
    const user = parseSessionUser(payload(""));
    expect(user).not.toBeNull();
    expect(user!.name).toBe("onboarding-probe@talo.test");
  });

  test("an account the API stored with no name is still owed onboarding", () => {
    const user = parseSessionUser(payload(""));
    expect(needsOnboarding(user!)).toBe(true);
    expect(signedInDestination(user!)).toBe(ONBOARDING_HREF);
  });

  test("the same for a null name, and for one that is only whitespace", () => {
    for (const blank of [null, undefined, "   "]) {
      const user = parseSessionUser(payload(blank));
      expect(needsOnboarding(user!)).toBe(true);
    }
  });

  test("an account with a real name goes to its Hub", () => {
    const user = parseSessionUser(payload("Ada Lovelace"));
    expect(needsOnboarding(user!)).toBe(false);
    expect(signedInDestination(user!)).toBe(ROLE_HREF.customer);
  });

  test("a name that merely contains the address is still a name", () => {
    // Only an exact match is the parser's substitution. Anything else is
    // something a person typed, and this gate must not take it away from them.
    const user = parseSessionUser(payload("onboarding-probe@talo.test (Ada)"));
    expect(needsOnboarding(user!)).toBe(false);
  });

  test("case and padding do not smuggle a blank name past the gate", () => {
    const user = parseSessionUser(payload("  ONBOARDING-PROBE@TALO.TEST  "));
    expect(needsOnboarding(user!)).toBe(true);
  });
});
