import {
  getUpdateState,
  readUpdateRefusal,
  readVersionCheck,
  resetUpdateStateForTests,
  setUpdateState,
  subscribeUpdateState,
} from "@/lib/app-update";

const STORE = "https://play.google.com/store/apps/details?id=com.thechatroute.app";

describe("readVersionCheck", () => {
  it.each([
    ["none", { data: { update: "none", latestVersion: null, storeUrl: null } }],
    ["available", { data: { update: "available", latestVersion: "1.0.23", storeUrl: STORE } }],
    ["required", { data: { update: "required", latestVersion: "1.0.23", storeUrl: STORE } }],
  ])("reads %s", (verdict, body) => {
    expect(readVersionCheck(body)?.verdict).toBe(verdict);
  });

  it.each([
    ["no body", null],
    ["no data", {}],
    ["an unknown verdict", { data: { update: "maybe" } }],
    ["an array", [{ update: "required" }]],
  ])("answers null for %s", (_label, body) => {
    expect(readVersionCheck(body)).toBeNull();
  });
});

describe("readUpdateRefusal", () => {
  it("reads a 426 update_required with its store link", () => {
    expect(
      readUpdateRefusal(426, {
        code: "update_required",
        meta: { latestVersion: "1.0.23", storeUrl: STORE },
      }),
    ).toEqual({ verdict: "required", latestVersion: "1.0.23", storeUrl: STORE });
  });

  it("ignores a 426 without the code, and the code on another status", () => {
    expect(readUpdateRefusal(426, { code: "other" })).toBeNull();
    expect(readUpdateRefusal(403, { code: "update_required" })).toBeNull();
  });
});

describe("setUpdateState", () => {
  beforeEach(resetUpdateStateForTests);

  it("never lifts a refusal", () => {
    setUpdateState({ verdict: "required", latestVersion: "1.0.23", storeUrl: STORE });
    setUpdateState({ verdict: "none", latestVersion: null, storeUrl: null });
    expect(getUpdateState().verdict).toBe("required");
  });

  it("tells listeners only when something changed", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeUpdateState(listener);
    setUpdateState({ verdict: "none", latestVersion: null, storeUrl: null });
    expect(listener).not.toHaveBeenCalled();
    setUpdateState({ verdict: "available", latestVersion: "1.0.23", storeUrl: STORE });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
