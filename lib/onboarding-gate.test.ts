import { parseSessionUser } from "@/lib/auth-response";
import { ROLE_HREF } from "@/lib/hub-routes";
import {
  ONBOARDING_HREF,
  needsOnboarding,
  signedInDestination,
} from "@/lib/onboarding-gate";

/**
 * Hand-built `SessionUser`s passed while this gate was completely broken on a
 * device: `parseSessionUser` substitutes the address for a blank name, so a
 * hand-built `name: ""` is a shape the app never holds. These go through the
 * parser instead.
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
    expect(user!.name).toBe("onboarding-probe@talo.test");
  });

  test("an account the API stored with no name is still owed onboarding, whatever the role", () => {
    const user = parseSessionUser(payload(""));
    expect(needsOnboarding(user!)).toBe(true);
    expect(signedInDestination(user!)).toBe(ONBOARDING_HREF);
    expect(signedInDestination({ ...user!, role: "admin" })).toBe(ONBOARDING_HREF);
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
    const user = parseSessionUser(payload("onboarding-probe@talo.test (Ada)"));
    expect(needsOnboarding(user!)).toBe(false);
  });

  test("case and padding do not smuggle a blank name past the gate", () => {
    const user = parseSessionUser(payload("  ONBOARDING-PROBE@TALO.TEST  "));
    expect(needsOnboarding(user!)).toBe(true);
  });
});
