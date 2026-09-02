import type { AuthState } from "@/lib/auth-machine";
import { SIGN_IN_HREF } from "@/lib/hub-routes";
import { sessionEndHref } from "@/lib/session-end";

const EVERY_STATUS: AuthState["status"][] = [
  "hydrating",
  "signed-out",
  "submitting",
  "signed-in",
  "unreachable",
];

describe("leaving a session", () => {
  test("signing out of a live session lands on sign-in", () => {
    expect(sessionEndHref({ from: "signed-in", to: "signed-out" })).toBe(SIGN_IN_HREF);
  });

  test("signing out from the Unreachable screen lands on sign-in too", () => {
    expect(sessionEndHref({ from: "unreachable", to: "signed-out" })).toBe(SIGN_IN_HREF);
  });
});

describe("staying put", () => {
  test("a cold start that finds no cookie navigates nowhere", () => {
    // `lib/launch-route` owns this one, behind the launch animation's minimum
    // display. Routing here would cut the animation short.
    expect(sessionEndHref({ from: "hydrating", to: "signed-out" })).toBeNull();
  });

  test("a refused sign-in does not replace the screen the person is typing on", () => {
    expect(sessionEndHref({ from: "submitting", to: "signed-out" })).toBeNull();
  });

  test("landing on sign-in from sign-in changes nothing", () => {
    expect(sessionEndHref({ from: "signed-out", to: "signed-out" })).toBeNull();
  });

  test("nothing that is not an ending navigates", () => {
    for (const from of EVERY_STATUS) {
      for (const to of EVERY_STATUS.filter((s) => s !== "signed-out")) {
        expect(sessionEndHref({ from, to })).toBeNull();
      }
    }
  });
});
