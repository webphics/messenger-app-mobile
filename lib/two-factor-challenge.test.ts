import {
  CHALLENGE_LAPSED_NOTICE,
  CHALLENGE_LIFETIME_MS,
  CODE_REQUIRED_NOTICE,
  CODE_SHAPE_NOTICE,
  codeError,
  normaliseCode,
} from "@/lib/two-factor-challenge";

describe("the challenge's lifetime", () => {
  /**
   * The number is better-auth's, not this client's: the `twoFactor` plugin sets
   * the cookie with `maxAge = options?.twoFactorCookieMaxAge ?? 600`, and
   * `api/src/modules/auth/auth.factory.ts` overrides nothing. Pinned because a
   * deadline that outlives the cookie would let somebody type a code into a
   * handshake that has already gone.
   */
  test("is the ten minutes the API's cookie is minted for", () => {
    expect(CHALLENGE_LIFETIME_MS).toBe(600_000);
  });

  test("says to sign in again, because that is the only way back in", () => {
    expect(CHALLENGE_LAPSED_NOTICE).toMatch(/sign in again/i);
  });
});

describe("normaliseCode", () => {
  test("takes the digits out of a code pasted with the space its app shows", () => {
    expect(normaliseCode("123 456")).toBe("123456");
  });

  test("trims, because a long-press paste brings the trailing space with it", () => {
    expect(normaliseCode("  123456  ")).toBe("123456");
  });

  test("removes every kind of whitespace, not only the ends", () => {
    expect(normaliseCode("1 2\t3\n4 5 6")).toBe("123456");
  });

  test("leaves a code that was typed straight alone", () => {
    expect(normaliseCode("123456")).toBe("123456");
  });
});

/**
 * Judged here rather than by the API, which is the one place this departs from
 * the password field on the step before: a password that fails today's rules may
 * still be a perfectly good older one, so only the server can rule on it. A TOTP
 * code has exactly one shape and always has, so a request that could only be
 * refused is not worth making.
 */
describe("codeError", () => {
  test("an empty field asks for the code rather than complaining about it", () => {
    expect(codeError("")).toBe(CODE_REQUIRED_NOTICE);
    expect(codeError("   ")).toBe(CODE_REQUIRED_NOTICE);
  });

  test.each(["12345", "1234567", "12345a", "abcdef", "12-345", "１２３４５６"])(
    "refuses %p before a request is made",
    (typed) => {
      expect(codeError(typed)).toBe(CODE_SHAPE_NOTICE);
    },
  );

  test.each(["123456", "000000", "123 456", " 123456 "])("accepts %p", (typed) => {
    expect(codeError(typed)).toBeNull();
  });

  test("says how many digits, so the rule is readable rather than guessable", () => {
    expect(CODE_SHAPE_NOTICE).toContain("6");
  });
});

