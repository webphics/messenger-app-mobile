import { parseKeptPerson, serialiseKeptPerson } from "@/lib/kept-person";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  // The keystore does not carry these three; the parse hands them back false/empty.
  hasPassword: false,
  twoFactorEnabled: false,
  supportAssignmentEnabled: true,
  capabilities: [],
};

test("a kept person comes back exactly as they went in", () => {
  expect(parseKeptPerson(serialiseKeptPerson(AGENT))).toEqual(AGENT);
});

test("only the four identity fields and the assignment switch are written down", () => {
  const written = serialiseKeptPerson({
    ...AGENT,
    hasPassword: true,
    twoFactorEnabled: true,
    capabilities: ["transfer", "close"],
  });

  expect(JSON.parse(written)).toEqual({
    id: AGENT.id,
    name: AGENT.name,
    email: AGENT.email,
    role: AGENT.role,
    supportAssignmentEnabled: true,
  });
});

test("a person kept by a build that did not write the switch comes back in a Shared queue", () => {
  const { supportAssignmentEnabled: _dropped, ...older } = AGENT;
  expect(parseKeptPerson(JSON.stringify(older))?.supportAssignmentEnabled).toBe(false);
});

test.each([
  ["an empty keystore", null],
  ["something that is not JSON", "better-auth.session_token=abc.def"],
  ["a role this build does not have", JSON.stringify({ ...AGENT, role: "owner" })],
] as [string, string | null][])("%s is nobody kept", (_label, raw) => {
  expect(parseKeptPerson(raw)).toBeNull();
});

test.each([
  ["agreed", "2026-10-31T10:00:00.000Z"],
  ["never agreed", null],
] as const)("the terms answer is kept when the API gave one: %s", (_label, termsAcceptedAt) => {
  const kept = parseKeptPerson(serialiseKeptPerson({ ...AGENT, termsAcceptedAt }));
  expect(kept?.termsAcceptedAt).toBe(termsAcceptedAt);
});

test("a person kept by a build from before the terms step is unknown, not unagreed", () => {
  expect(parseKeptPerson(JSON.stringify(AGENT))).not.toHaveProperty("termsAcceptedAt");
});
