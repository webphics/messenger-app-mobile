import {
  EMPTY_PASSWORD_DRAFT,
  PASSWORD_COPY,
  PASSWORD_LENGTH_RULE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  asksForCurrentPassword,
  checkPassword,
  passwordFields,
  passwordMode,
  type PasswordDraft,
  type PasswordMode,
} from "@/lib/password-rules";

/**
 * The module ticket 06 is really about, tested as a table.
 *
 * Everything the password screen decides before it talks to the API is here,
 * which is the whole point of the split: which of two things the screen is
 * doing, which fields that calls for, what is wrong with a form somebody has
 * only half filled in, and exactly what body goes over the wire. None of it
 * needs a rendered screen to demonstrate, so none of it is tested through one.
 *
 * `lib/sign-in-steps.test.ts` is the model, being the other module that picks a
 * mode from account state and carries the copy each mode uses.
 */

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

describe("which of the two things this screen is doing", () => {
  test.each([
    [false, "set"],
    [true, "change"],
  ] as const)("hasPassword %s is %s", (hasPassword, expected) => {
    expect(passwordMode({ hasPassword })).toBe(expected);
  });

  test("it is answered from account state alone, so nobody is asked", () => {
    // The acceptance criterion in ticket 06: the screen decides which of the
    // two applies rather than putting the question to the person. The only
    // input this function has is the account.
    expect(passwordMode({ hasPassword: false })).not.toBe(
      passwordMode({ hasPassword: true }),
    );
  });
});

describe("the fields each mode draws", () => {
  test("setting a first password has no current-password field at all", () => {
    // Not a field that is present and optional. There is nothing to prove, so
    // there is nothing to ask for.
    expect(asksForCurrentPassword("set")).toBe(false);
    expect(passwordFields("set")).toEqual(["next", "confirmation"]);
  });

  test("changing one asks for the current password first", () => {
    expect(asksForCurrentPassword("change")).toBe(true);
    expect(passwordFields("change")).toEqual([
      "current",
      "next",
      "confirmation",
    ]);
  });

  test("both modes ask for the new password and its confirmation", () => {
    for (const mode of MODES) {
      expect(passwordFields(mode)).toContain("next");
      expect(passwordFields(mode)).toContain("confirmation");
    }
  });
});

describe("the length rule, at its boundaries", () => {
  // 8 to 128, from `passwordSchema` in the API's `common.schema.ts`. Held here
  // so the sentence a person reads before submitting and the rule that is
  // enforced cannot drift apart.
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

  test("too short and too long do not say the same thing", () => {
    const short = checkPassword("set", filled("set", chars(4))).errors.next;
    const long = checkPassword(
      "set",
      filled("set", chars(PASSWORD_MAX_LENGTH + 40)),
    ).errors.next;

    expect(short).toBeTruthy();
    expect(long).toBeTruthy();
    expect(short).not.toBe(long);
  });

  test("the sentence shown before submission names both numbers", () => {
    expect(PASSWORD_LENGTH_RULE).toContain(String(PASSWORD_MIN_LENGTH));
    expect(PASSWORD_LENGTH_RULE).toContain(String(PASSWORD_MAX_LENGTH));
  });
});

describe("a confirmation that does not match", () => {
  test.each(MODES)("is caught before submission in %s mode", (mode) => {
    const check = checkPassword(
      mode,
      draft({ ...filled(mode), confirmation: "something-else" }),
    );

    expect(check.errors.confirmation).toBeTruthy();
    expect(check.firstError).toBe("confirmation");
    // Never discovered through a rejection: nothing may be sent.
    expect(check.submission).toBeNull();
  });

  test("the new password itself is not blamed for the typo", () => {
    const check = checkPassword(
      "set",
      draft({ next: chars(12), confirmation: chars(11) }),
    );

    expect(check.errors.next).toBeUndefined();
    expect(check.errors.confirmation).toBeTruthy();
  });

  test("an empty confirmation reads as missing rather than as a mismatch", () => {
    const check = checkPassword("set", draft({ next: chars(12) }));

    expect(check.errors.confirmation).toBeTruthy();
    expect(check.errors.confirmation).not.toBe(
      checkPassword("set", draft({ next: chars(12), confirmation: "x" })).errors
        .confirmation,
    );
  });
});

describe("whitespace", () => {
  // The API trims before it measures: `baseString` in `common.schema.ts` calls
  // `.trim()` ahead of the min and max. So a client that measured the raw value
  // would pass a password the server then shortened and refused, and a person
  // whose keyboard added a trailing space would have stored a password they
  // could never type again.
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
    const check = checkPassword(
      "set",
      draft({ next: short, confirmation: short }),
    );

    expect(check.errors.next).toBeTruthy();
    expect(check.submission).toBeNull();
  });

  test("a confirmation differing only in surrounding whitespace matches", () => {
    const check = checkPassword(
      "set",
      draft({ next: chars(12), confirmation: `  ${chars(12)}` }),
    );

    expect(check.errors.confirmation).toBeUndefined();
  });

  test("a field of nothing but spaces is empty, not eight characters", () => {
    const check = checkPassword("set", draft({ next: "        " }));

    expect(check.errors.next).toBe(
      checkPassword("set", EMPTY_PASSWORD_DRAFT).errors.next,
    );
  });

  test("whitespace inside a password is part of it and is kept", () => {
    const passphrase = "correct horse battery";
    const check = checkPassword(
      "set",
      draft({ next: passphrase, confirmation: passphrase }),
    );

    expect(check.submission).toEqual({
      mode: "set",
      newPassword: passphrase,
    });
  });
});

describe("the current password", () => {
  test("is required when changing", () => {
    const check = checkPassword(
      "change",
      draft({ next: chars(12), confirmation: chars(12) }),
    );

    expect(check.errors.current).toBeTruthy();
    expect(check.firstError).toBe("current");
    expect(check.submission).toBeNull();
  });

  test("carries no length rule of its own", () => {
    // Whether it is the right password is the server's answer, and a length
    // complaint about a password that is simply wrong would send somebody
    // looking for a problem that is not there. An account whose password
    // predates the current rule can still be changed.
    const check = checkPassword(
      "change",
      draft({ current: "old", next: chars(12), confirmation: chars(12) }),
    );

    expect(check.errors.current).toBeUndefined();
    expect(check.submission).toEqual({
      mode: "change",
      currentPassword: "old",
      newPassword: chars(12),
    });
  });

  test("is not required when setting a first one", () => {
    const check = checkPassword(
      "set",
      draft({ next: chars(12), confirmation: chars(12) }),
    );

    expect(check.errors.current).toBeUndefined();
    expect(check.firstError).toBeNull();
  });

  test("is not sent when setting, even if something was typed into it", () => {
    // `POST /auth/set-password` takes a strict object. An extra key is refused
    // outright rather than ignored, so the submission has to be exactly the one
    // field.
    const { submission } = checkPassword(
      "set",
      draft({ current: "typed-then-switched", next: chars(12), confirmation: chars(12) }),
    );

    expect(submission).toEqual({ mode: "set", newPassword: chars(12) });
    expect(submission && "currentPassword" in submission).toBe(false);
  });
});

describe("a form nobody has filled in yet", () => {
  // `AGENTS.md`: submit stays enabled until the request starts, and an
  // incomplete form is submitted to surface its validation. So this module has
  // to answer for an empty draft rather than assume the screen blocked one.
  test.each(MODES)("says what is wrong with every field %s draws", (mode) => {
    const check = checkPassword(mode, EMPTY_PASSWORD_DRAFT);

    expect(check.submission).toBeNull();
    for (const field of passwordFields(mode)) {
      expect(check.errors[field]).toBeTruthy();
    }
  });

  test.each(MODES)("and about no field %s does not draw", (mode) => {
    const check = checkPassword(mode, EMPTY_PASSWORD_DRAFT);
    const drawn = passwordFields(mode);

    for (const field of ["current", "next", "confirmation"] as const) {
      if (!drawn.includes(field)) expect(check.errors[field]).toBeUndefined();
    }
  });

  test.each(MODES)("and points at the first of them, for focus, in %s", (mode) => {
    const check = checkPassword(mode, EMPTY_PASSWORD_DRAFT);

    expect(check.firstError).toBe(passwordFields(mode)[0]);
  });
});

describe("a form that is ready", () => {
  test.each(MODES)("reports nothing wrong in %s mode", (mode) => {
    const check = checkPassword(mode, filled(mode));

    expect(check.errors).toEqual({});
    expect(check.firstError).toBeNull();
    expect(check.submission).not.toBeNull();
  });

  test("the submission names its own mode, so a caller cannot send the wrong body", () => {
    expect(checkPassword("set", filled("set")).submission?.mode).toBe("set");
    expect(checkPassword("change", filled("change")).submission?.mode).toBe(
      "change",
    );
  });
});

describe("copy", () => {
  test("every mode has a title, a description, a submit label and a success line", () => {
    for (const mode of MODES) {
      const copy = PASSWORD_COPY[mode];
      expect(copy.title).not.toBe("");
      expect(copy.description).not.toBe("");
      expect(copy.submitLabel).not.toBe("");
      expect(copy.success).not.toBe("");
    }
  });

  test("the two modes do not say the same thing", () => {
    // Setting a first password and replacing one are different news, and one
    // wording covering both would be vague enough to be useless to either
    // person. `lib/sign-in-steps` makes the same distinction.
    expect(PASSWORD_COPY.set.title).not.toBe(PASSWORD_COPY.change.title);
    expect(PASSWORD_COPY.set.submitLabel).not.toBe(
      PASSWORD_COPY.change.submitLabel,
    );
  });

  test("a success says the session survived it", () => {
    for (const mode of MODES) {
      expect(PASSWORD_COPY[mode].success.toLowerCase()).toContain("signed in");
    }
  });
});
