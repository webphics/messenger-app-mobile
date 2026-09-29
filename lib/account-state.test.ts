import { parseAccountState } from "@/lib/account-state";

describe("reading the probe's answer", () => {
  test("an account with a password", () => {
    expect(parseAccountState({ exists: true, hasPassword: true })).toEqual({
      exists: true,
      hasPassword: true,
    });
  });
});

describe("a shape this build does not understand", () => {
  test("a missing field is refused", () => {
    expect(parseAccountState({ exists: true })).toBeNull();
  });

  test("a password on an identifier nobody holds is refused, not acted on", () => {
    // The API states hasPassword is false whenever exists is false. A payload
    // breaking that is a contract this build has lost track of, and guessing
    // which half is right would draw the wrong screen either way.
    expect(parseAccountState({ exists: false, hasPassword: true })).toBeNull();
  });
});
