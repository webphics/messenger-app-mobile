import { parseSessionUser } from "@/lib/auth-response";
import { ROLE_HREF } from "@/lib/hub-routes";
import {
  ONBOARDING_HREF,
  TERMS_HREF,
  termsRedirect,
  needsOnboarding,
  needsTerms,
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
    termsAcceptedAt: "2026-10-31T10:00:00.000Z",
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

describe("termsRedirect: reaching the gate from wherever the person is", () => {
  const person = (termsAcceptedAt?: string | null) => {
    const user = parseSessionUser({
      id: "e0d3c1a2-0000-4000-8000-000000000000",
      name: "Ada Lovelace",
      email: "ada@talo.test",
      role: "agent",
      termsAcceptedAt: termsAcceptedAt ?? null,
    })!;
    if (termsAcceptedAt !== undefined) return user;
    const { termsAcceptedAt: _unknown, ...kept } = user;
    return kept;
  };

  test.each([
    ["owes the terms, on a Hub screen", person(null), "/", TERMS_HREF],
    ["owes the terms, deep in a thread", person(null), "/chat/abc", TERMS_HREF],
    ["owes the terms, already on the gate", person(null), "/terms", null],
    ["owes the terms, deleting the account", person(null), "/account/delete", null],
    ["has agreed", person("2026-10-31T10:00:00.000Z"), "/chat/abc", null],
    ["kept by an older build, no answer yet", person(undefined), "/chat/abc", null],
    ["nobody signed in", null, "/sign-in", null],
  ])("%s → %s", (_label, user, pathname, expected) => {
    expect(termsRedirect(user, pathname)).toBe(expected);
  });
});

describe("the terms gate, through the parser", () => {
  const payload = (overrides: Record<string, unknown>) => ({
    id: "e0d3c1a2-0000-4000-8000-000000000000",
    name: "Ada Lovelace",
    email: "ada@talo.test",
    role: "customer",
    ...overrides,
  });

  test.each([
    ["the API says they never agreed", { termsAcceptedAt: null }, true],
    ["the API leaves the field out", {}, true],
    ["the API has a date", { termsAcceptedAt: "2026-10-31T10:00:00.000Z" }, false],
  ])("%s: owed the terms screen is %s", (_, overrides, expected) => {
    expect(needsTerms(parseSessionUser(payload(overrides))!)).toBe(expected);
  });

  test("the terms come before onboarding, and before the Hub", () => {
    const nameless = parseSessionUser(payload({ name: "", termsAcceptedAt: null }))!;
    expect(signedInDestination(nameless)).toBe(TERMS_HREF);
    const agreed = parseSessionUser(payload({ name: "", termsAcceptedAt: "2026-10-31T10:00:00.000Z" }))!;
    expect(signedInDestination(agreed)).toBe(ONBOARDING_HREF);
  });

  test("a person kept from before the field existed is not stopped offline", () => {
    const kept = parseSessionUser(payload({ termsAcceptedAt: "2026-10-31T10:00:00.000Z" }))!;
    const { termsAcceptedAt: _unknown, ...older } = kept;
    expect(needsTerms(older)).toBe(false);
  });
});
