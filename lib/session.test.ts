import { getSession, getSessionUser, setSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
};

afterEach(() => {
  setSessionUser(null);
});

test("signed out reads as no identity", () => {
  expect(getSessionUser()).toBeNull();
  expect(getSession()).toEqual({ email: null, name: null, role: "customer" });
});

test("a signed-in person is repeated verbatim, role included", () => {
  setSessionUser(AGENT);
  expect(getSessionUser()).toEqual(AGENT);
  expect(getSession()).toEqual({
    email: "qa-agent@talo.test",
    name: "QA Agent",
    role: "agent",
  });
});

test.each(["admin", "agent", "customer"] as const)(
  "the %s role is mirrored, never translated",
  (role) => {
    setSessionUser({ ...AGENT, role });
    expect(getSession().role).toBe(role);
  },
);

test("signing out drops the identity, role included", () => {
  setSessionUser({ ...AGENT, role: "admin" });
  setSessionUser(null);
  expect(getSession()).toEqual({ email: null, name: null, role: "customer" });
});
