import { parseKeptPerson, serialiseKeptPerson } from "@/lib/kept-person";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
};

test("a kept person comes back exactly as they went in", () => {
  expect(parseKeptPerson(serialiseKeptPerson(AGENT))).toEqual(AGENT);
});

test("only the four fields are written down", () => {
  const written = serialiseKeptPerson({
    ...AGENT,
    // Whatever a later slice hangs off a session, the keystore is not where it
    // goes: this holds an identity, not a copy of the session payload.
    twoFactorEnabled: true,
  } as SessionUser);

  expect(JSON.parse(written)).toEqual(AGENT);
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
