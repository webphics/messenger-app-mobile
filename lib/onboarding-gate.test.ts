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
