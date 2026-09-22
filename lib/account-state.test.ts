import { parseAccountState } from "@/lib/account-state";

describe("reading the probe's answer", () => {
  test("an account with a password", () => {
    expect(parseAccountState({ exists: true, hasPassword: true })).toEqual({
      exists: true,
      hasPassword: true,
    });
  });

  test("an account that has only ever used Google", () => {
    expect(parseAccountState({ exists: true, hasPassword: false })).toEqual({
      exists: true,
      hasPassword: false,
    });
  });

  test("an identifier nobody holds", () => {
    expect(parseAccountState({ exists: false, hasPassword: false })).toEqual({
      exists: false,
      hasPassword: false,
    });
  });

  test("extra fields are ignored rather than carried", () => {
    // The route promises two booleans and nothing else. If it ever grows a
    // third field, this client must not start drawing off it by accident.
    expect(
      parseAccountState({ exists: true, hasPassword: true, name: "Ada" }),
    ).toEqual({ exists: true, hasPassword: true });
  });
});

describe("a shape this build does not understand", () => {
  const refused: [string, unknown][] = [
    ["not a record", "yes"],
    ["null", null],
    ["a missing field", { exists: true }],
    ["a string where a boolean belongs", { exists: "true", hasPassword: false }],
    ["a number where a boolean belongs", { exists: 1, hasPassword: 0 }],
  ];

  test.each(refused)("%s is refused", (_label, payload) => {
    expect(parseAccountState(payload)).toBeNull();
  });

  test("a password on an identifier nobody holds is refused, not acted on", () => {
    // The API states hasPassword is false whenever exists is false. A payload
    // breaking that is a contract this build has lost track of, and guessing
    // which half is right would draw the wrong screen either way.
    expect(parseAccountState({ exists: false, hasPassword: true })).toBeNull();
  });
});
