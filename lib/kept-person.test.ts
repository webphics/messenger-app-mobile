import { parseKeptPerson, serialiseKeptPerson } from "@/lib/kept-person";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  // Both false, because the keystore does not carry them and the parse
  // therefore hands them back as false. See `serialiseKeptPerson`.
  hasPassword: false,
  twoFactorEnabled: false,
  // Carried, unlike the two above: it decides which screens a Stale session draws.
  supportAssignmentEnabled: true,
};

test("a kept person comes back exactly as they went in", () => {
  expect(parseKeptPerson(serialiseKeptPerson(AGENT))).toEqual(AGENT);
});

test("only the four identity fields and the assignment switch are written down", () => {
  const written = serialiseKeptPerson({
    ...AGENT,
    // Whatever a session hangs off a person, the keystore is not where it goes:
    // this holds an identity, not a copy of the session payload. Which is why
    // the two account-state flags are dropped here and come back false. A
    // Stale session hides the account controls until the API confirms it. See
    // `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`.
    hasPassword: true,
    twoFactorEnabled: true,
  });

  expect(JSON.parse(written)).toEqual({
    id: AGENT.id,
    name: AGENT.name,
    email: AGENT.email,
    role: AGENT.role,
    supportAssignmentEnabled: true,
  });
});

test.each([true, false])("the assignment switch comes back as it went in: %s", (on) => {
  expect(
    parseKeptPerson(serialiseKeptPerson({ ...AGENT, supportAssignmentEnabled: on }))
      ?.supportAssignmentEnabled,
  ).toBe(on);
});

test("a person kept by a build that did not write the switch comes back in a Shared queue", () => {
  const { supportAssignmentEnabled: _dropped, ...older } = AGENT;
  expect(parseKeptPerson(JSON.stringify(older))?.supportAssignmentEnabled).toBe(false);
});

test("a Stale person comes back with both account flags false", () => {
  const kept = parseKeptPerson(
    serialiseKeptPerson({ ...AGENT, hasPassword: true, twoFactorEnabled: true }),
  );

  expect(kept?.hasPassword).toBe(false);
  expect(kept?.twoFactorEnabled).toBe(false);
});

describe("what is not a kept person", () => {
  const cases: [string, string | null][] = [
    ["an empty keystore", null],
    ["a blank value", ""],
    ["something that is not JSON", "better-auth.session_token=abc.def"],
    ["JSON that is not an object", '"qa-agent@talo.test"'],
    ["a person with no id", JSON.stringify({ ...AGENT, id: "" })],
    ["a person with no email", JSON.stringify({ ...AGENT, email: "" })],
    // The role decides which Hub opens, so a value this build cannot place is
    // not a person it may sign in — it is the whole of what a session says.
    ["a role this build does not have", JSON.stringify({ ...AGENT, role: "owner" })],
  ];

  test.each(cases)("%s is nobody kept", (_label, raw) => {
    expect(parseKeptPerson(raw)).toBeNull();
  });
});

test("a person with no name is still a person, named by their address", () => {
  expect(parseKeptPerson(JSON.stringify({ ...AGENT, name: "" }))).toEqual({
    ...AGENT,
    name: AGENT.email,
  });
});
