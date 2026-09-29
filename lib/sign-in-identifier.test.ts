import {
  IDENTIFIER_INVALID_NOTICE,
  IDENTIFIER_REQUIRED_NOTICE,
  identifierError,
  normaliseIdentifier,
} from "@/lib/sign-in-identifier";

describe("what the field accepts", () => {
  const accepted = [
    ["a plain address", "ada@example.com"],
    ["a username at the 20-character bound", "a".repeat(20)],
  ] as const;

  test.each(accepted)("%s", (_label, value) => {
    expect(identifierError(value)).toBeNull();
  });
});

describe("what it refuses, in the API's own words", () => {
  test("nothing typed reports the field as missing, not as malformed", () => {
    expect(identifierError("")).toBe(IDENTIFIER_REQUIRED_NOTICE);
  });

  const refused = [
    ["a username one character over the bound", "a".repeat(21)],
    ["an address with no dot in its domain", "ada@example"],
  ] as const;

  test.each(refused)("%s", (_label, value) => {
    expect(identifierError(value)).toBe(IDENTIFIER_INVALID_NOTICE);
  });
});

describe("the two tests are not the same test", () => {
  test("a long address is not refused for the username bound", () => {
    // 20 characters is the username rule and must not leak onto the other
    // branch; this address is well over it and perfectly valid.
    const address = "ada.lovelace.1815@example.com";
    expect(address.length).toBeGreaterThan(20);
    expect(identifierError(address)).toBeNull();
  });
});

describe("what is sent", () => {
  test("trimmed and lower-cased, the way both ends do it", () => {
    expect(normaliseIdentifier("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});
