import {
  EMPTY_PASSWORD_DRAFT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPassword,
  type PasswordDraft,
  type PasswordMode,
} from "@/lib/password-rules";

const MODES: PasswordMode[] = ["set", "change"];

const draft = (over: Partial<PasswordDraft> = {}): PasswordDraft => ({
  ...EMPTY_PASSWORD_DRAFT,
  ...over,
});

/** A password of exactly this many characters, so a boundary reads as a number. */
const chars = (length: number) => "a".repeat(length);

/** A filled-in form for the given mode, valid in both. */
const filled = (mode: PasswordMode, next = chars(12)): PasswordDraft =>
  draft({
    current: mode === "change" ? "the-old-one" : "",
    next,
    confirmation: next,
  });

describe("the length rule, at its boundaries", () => {
  // 8 to 128, from `passwordSchema` in the API's `common.schema.ts`.
  test.each([
    [PASSWORD_MIN_LENGTH - 1, false],
    [PASSWORD_MIN_LENGTH, true],
    [PASSWORD_MAX_LENGTH, true],
    [PASSWORD_MAX_LENGTH + 1, false],
  ])("%i characters is allowed: %s", (length, allowed) => {
    for (const mode of MODES) {
      const check = checkPassword(mode, filled(mode, chars(length)));
      expect(check.errors.next === undefined).toBe(allowed);
      expect(check.submission !== null).toBe(allowed);
    }
  });
});

// The API trims before it measures: a client that measured the raw value would
// pass a password the server then shortened and refused.
describe("whitespace", () => {
  test("surrounding whitespace is gone before the rule is applied", () => {
    const check = checkPassword(
      "set",
      draft({
        next: `  ${chars(PASSWORD_MIN_LENGTH)}  `,
        confirmation: `${chars(PASSWORD_MIN_LENGTH)} `,
      }),
    );

    expect(check.errors).toEqual({});
    expect(check.submission).toEqual({
      mode: "set",
      newPassword: chars(PASSWORD_MIN_LENGTH),
    });
  });

  test("and cannot pad a short password up to the minimum", () => {
    const short = `${chars(PASSWORD_MIN_LENGTH - 1)}  `;
    const check = checkPassword("set", draft({ next: short, confirmation: short }));

    expect(check.errors.next).toBeTruthy();
    expect(check.submission).toBeNull();
  });
});

test.each(MODES)("a confirmation that does not match is caught before submission in %s mode", (mode) => {
  const check = checkPassword(mode, draft({ ...filled(mode), confirmation: "something-else" }));

  expect(check.errors.confirmation).toBeTruthy();
  expect(check.submission).toBeNull();
});

describe("the current password", () => {
  test("is required when changing", () => {
    const check = checkPassword("change", draft({ next: chars(12), confirmation: chars(12) }));

    expect(check.errors.current).toBeTruthy();
    expect(check.submission).toBeNull();
  });

  // `POST /auth/set-password` takes a strict object: an extra key is refused.
  test("is not sent when setting, even if something was typed into it", () => {
    const { submission } = checkPassword(
      "set",
      draft({ current: "typed-then-switched", next: chars(12), confirmation: chars(12) }),
    );

    expect(submission).toEqual({ mode: "set", newPassword: chars(12) });
  });
});
