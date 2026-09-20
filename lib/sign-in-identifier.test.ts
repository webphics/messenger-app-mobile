import {
  IDENTIFIER_INVALID_NOTICE,
  IDENTIFIER_REQUIRED_NOTICE,
  identifierError,
  identifierKind,
  normaliseIdentifier,
} from "@/lib/sign-in-identifier";

describe("what the field accepts", () => {
  const accepted = [
    ["a plain address", "ada@example.com"],
    ["an address with a subdomain", "ada@mail.example.com"],
    ["a bare username", "ada"],
    ["a username with an underscore", "ada_lovelace"],
    ["a username with digits", "ada1815"],
    ["a username at the 20-character bound", "a".repeat(20)],
    ["surrounding whitespace, which is not part of the value", "  ada  "],
    ["a mixed-case username, since both ends lower-case", "Ada"],
  ] as const;

  test.each(accepted)("%s", (_label, value) => {
    expect(identifierError(value)).toBeNull();
  });
});

describe("what it refuses, in the API's own words", () => {
  test("nothing typed reports the field as missing, not as malformed", () => {
    expect(identifierError("")).toBe(IDENTIFIER_REQUIRED_NOTICE);
  });

  test("whitespace alone is nothing typed", () => {
    expect(identifierError("   ")).toBe(IDENTIFIER_REQUIRED_NOTICE);
  });

  const refused = [
    ["a username one character over the bound", "a".repeat(21)],
    ["a username with a hyphen, which the generation rule never produces", "ada-lovelace"],
    ["a username with a dot", "ada.lovelace"],
    ["a username with a space", "ada lovelace"],
    ["an address with no dot in its domain", "ada@example"],
    ["an address with no domain at all", "ada@"],
    ["an address with no local part", "@example.com"],
    ["a value over the 255-character cap", `${"a".repeat(250)}@example.com`],
  ] as const;

  test.each(refused)("%s", (_label, value) => {
    expect(identifierError(value)).toBe(IDENTIFIER_INVALID_NOTICE);
  });
});

describe("the two tests are not the same test", () => {
  // The whole point of mirroring the API rather than approximating it. A value
  // carrying an `@` is judged as an address even though it would otherwise be a
  // legal-looking username, so it can never reach the username route with an
  // `@` in it.
  test("a value with an `@` is judged as an address, not as a username", () => {
    expect(identifierError("ada@example")).toBe(IDENTIFIER_INVALID_NOTICE);
  });

  test("and it is refused rather than routed as a username", () => {
    // Routing reads the full pattern, so this is not an email either. What
    // matters is that validation refuses it before routing is ever consulted.
    expect(identifierKind("ada@example")).toBe("username");
    expect(identifierError("ada@example")).not.toBeNull();
  });

  test("a long address is not refused for the username bound", () => {
    // 20 characters is the username rule and must not leak onto the other
    // branch; this address is well over it and perfectly valid.
    const address = "ada.lovelace.1815@example.com";
    expect(address.length).toBeGreaterThan(20);
    expect(identifierError(address)).toBeNull();
  });
});

describe("which route a value takes", () => {
  test("a full address is the email branch", () => {
    expect(identifierKind("ada@example.com")).toBe("email");
  });

  test("anything else is the username branch", () => {
    expect(identifierKind("ada")).toBe("username");
  });

  test("whitespace does not change the branch", () => {
    expect(identifierKind("  ada@example.com  ")).toBe("email");
  });
});

describe("what is sent", () => {
  test("trimmed and lower-cased, the way both ends do it", () => {
    expect(normaliseIdentifier("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  test("a username goes the same way", () => {
    expect(normaliseIdentifier(" Ada_Lovelace ")).toBe("ada_lovelace");
  });
});
