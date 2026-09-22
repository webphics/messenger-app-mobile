import {
  BACKUP_CODES_COPY,
  TWO_FACTOR_COPY,
  TWO_FACTOR_DISABLE_CONFIRMATION,
  TWO_FACTOR_PASSWORD_COPY,
  asksForPassword,
  checkTwoFactorPassword,
  twoFactorActions,
  twoFactorStatus,
  type TwoFactorAccount,
  type TwoFactorStatus,
} from "@/lib/two-factor-management";

/**
 * The module ticket 07 is really about, tested as a table.
 *
 * Everything the two-factor screen decides before it talks to the API is here:
 * which state it is reporting, what it offers in that state, whether there is a
 * password field, and exactly what goes in the body. None of it needs a rendered
 * screen to demonstrate, so none of it is tested through one.
 *
 * `lib/password-rules.test.ts` is the model, being the other module in this
 * section that picks what a screen draws from account state and carries the copy
 * it uses.
 *
 * The cross product is small enough to run whole, so it is run whole: both
 * values of `twoFactorEnabled` against both values of `hasPassword`. The two
 * questions are independent by design, and a table is how that stays true.
 */

const ACCOUNTS: TwoFactorAccount[] = [
  { twoFactorEnabled: false, hasPassword: false },
  { twoFactorEnabled: false, hasPassword: true },
  { twoFactorEnabled: true, hasPassword: false },
  { twoFactorEnabled: true, hasPassword: true },
];

const STATUSES: TwoFactorStatus[] = ["on", "off"];

describe("which state the screen is reporting", () => {
  test.each([
    [false, "off"],
    [true, "on"],
  ] as const)("twoFactorEnabled %s is %s", (twoFactorEnabled, expected) => {
    expect(twoFactorStatus({ twoFactorEnabled })).toBe(expected);
  });

  test.each(ACCOUNTS)("is read off the account alone (%s)", (account) => {
    // Rule 1. The state is carried on `SessionUser` from sign-in, so nobody is
    // asked and nothing is fetched to answer it.
    expect(twoFactorStatus(account)).toBe(account.twoFactorEnabled ? "on" : "off");
  });
});

describe("what two-factor on offers", () => {
  test.each(ACCOUNTS.filter((account) => account.twoFactorEnabled))(
    "turning it off and replacing the codes, and nothing else (%s)",
    (account) => {
      expect(twoFactorActions(account).map((action) => action.kind)).toEqual([
        "disable",
        "regenerate-backup-codes",
      ]);
    },
  );

  test("turning it off is the destructive one, so it is confirmed first", () => {
    const [disable, regenerate] = twoFactorActions({ twoFactorEnabled: true });

    expect(disable?.destructive).toBe(true);
    // Not destructive in the same way: the replacement arrives on the same
    // screen in the same breath, so what it takes away is visibly returned.
    expect(regenerate?.destructive).toBe(false);
  });

  test("every control is named for a screen reader as well as for the eye", () => {
    for (const action of twoFactorActions({ twoFactorEnabled: true })) {
      expect(action.label).not.toBe("");
      expect(action.accessibilityLabel).not.toBe("");
      expect(action.accessibilityLabel).not.toBe(action.label);
    }
  });

  test("what the actions are does not depend on whether there is a password", () => {
    // The password gates how an action is sent, never which actions exist. A
    // magic-link-only account can still turn two-factor off.
    expect(twoFactorActions({ twoFactorEnabled: true })).toEqual(
      twoFactorActions({ twoFactorEnabled: true }),
    );
  });
});

describe("what two-factor off offers", () => {
  test.each(ACCOUNTS.filter((account) => !account.twoFactorEnabled))(
    "nothing at all (%s)",
    (account) => {
      expect(twoFactorActions(account)).toEqual([]);
    },
  );

  test("the emptiness is this module's answer, not a component's omission", () => {
    // Ticket 07's acceptance criterion is that an account with two-factor off is
    // offered nothing that would enable it. Stated here so it is a rule with a
    // test rather than a control somebody forgot to draw and a later ticket
    // "fixes".
    expect(twoFactorActions({ twoFactorEnabled: false })).toHaveLength(0);
  });
});

describe("nothing here can turn two-factor on", () => {
  // The hard boundary of ticket 07, and the reason is a lockout rather than
  // scope: `POST /auth/two-factor/verify-backup-code` is behind `AuthGuard`, so
  // a backup code is suspected to be unredeemable at challenge time, which is
  // the one moment it exists for. Offering enable would let somebody turn on a
  // lock and throw away the only spare key. See ADR-0013 and issue 02.
  test.each(ACCOUNTS)("no action list contains an enable action (%s)", (account) => {
    for (const action of twoFactorActions(account)) {
      // `String` rather than the value itself, because `TwoFactorActionKind`
      // has no such member: the assertion has to survive the type that already
      // makes it true, so that widening the union later is what trips it.
      expect(String(action.kind)).not.toBe("enable");
      expect(String(action.kind)).not.toBe("setup");
    }
  });

  test.each(ACCOUNTS)("and nothing is labelled as turning it on (%s)", (account) => {
    for (const action of twoFactorActions(account)) {
      expect(action.label).not.toMatch(/turn on|enable|set up|switch on/i);
      expect(action.accessibilityLabel).not.toMatch(
        /turn on|enable|set up|switch on/i,
      );
    }
  });

  test("the copy for the off state offers no way to change it either", () => {
    const off = `${TWO_FACTOR_COPY.off.statusLine} ${TWO_FACTOR_COPY.off.detail}`;

    // It names the absence, which is what stops somebody hunting for a control
    // that is not there, and it points at no other client: offering the thing
    // one indirection later is still offering it.
    expect(off).toMatch(/not something this app does yet/i);
    expect(off).not.toMatch(/web app|browser|desktop|laptop/i);
  });
});

describe("when a password is asked for", () => {
  test.each([
    [false, false],
    [true, true],
  ])("hasPassword %s draws a field: %s", (hasPassword, expected) => {
    expect(asksForPassword({ hasPassword })).toBe(expected);
  });

  test.each(ACCOUNTS)(
    "exactly when the account has one, whatever the state (%s)",
    (account) => {
      // Rule 4, from `shouldRequirePassword` in better-auth with
      // `allowPasswordless: true`, which reduces to "the account has a
      // credential password". Nothing about `twoFactorEnabled` enters into it.
      expect(asksForPassword(account)).toBe(account.hasPassword);
    },
  );
});

describe("the body each account sends", () => {
  test("an account with no password sends nothing rather than an empty one", () => {
    // Both routes take a `z.strictObject({ password?: string })`, so
    // `{ password: "" }` is a present-but-empty password the API refuses, while
    // an absent one is allowed and is the whole point of `allowPasswordless`.
    const check = checkTwoFactorPassword({ hasPassword: false }, "");

    expect(check).toEqual({ error: null, password: null });
  });

  test("and drops whatever was typed into a field it never drew", () => {
    const check = checkTwoFactorPassword(
      { hasPassword: false },
      "left-over-from-somewhere",
    );

    expect(check.password).toBeNull();
    expect(check.error).toBeNull();
  });

  test("an account with a password sends the one that was typed", () => {
    const check = checkTwoFactorPassword({ hasPassword: true }, "the-real-one");

    expect(check).toEqual({ error: null, password: "the-real-one" });
  });

  test("an empty field on an account that has one is caught before the request", () => {
    const check = checkTwoFactorPassword({ hasPassword: true }, "");

    expect(check.error).toBeTruthy();
    expect(check.password).toBeNull();
  });

  test("a field of nothing but spaces is empty rather than a password", () => {
    expect(checkTwoFactorPassword({ hasPassword: true }, "    ").error).toBe(
      checkTwoFactorPassword({ hasPassword: true }, "").error,
    );
  });

  test("surrounding whitespace is gone before it is sent", () => {
    // The API's `baseString` trims before anything else sees the value, so an
    // untrimmed password would be one the server then shortened.
    expect(
      checkTwoFactorPassword({ hasPassword: true }, "  hunter2  ").password,
    ).toBe("hunter2");
  });

  test("whitespace inside a password is part of it and is kept", () => {
    expect(
      checkTwoFactorPassword({ hasPassword: true }, "correct horse battery")
        .password,
    ).toBe("correct horse battery");
  });

  test("the current password carries no length rule of its own", () => {
    // Whether it is the right password is the server's answer. A complaint
    // about the length of a password that is simply wrong would send somebody
    // looking for a problem that is not there, and an account whose password
    // predates the current rule can still turn two-factor off.
    expect(checkTwoFactorPassword({ hasPassword: true }, "old").error).toBeNull();
  });
});

describe("copy", () => {
  test("each state says plainly whether two-factor is on", () => {
    expect(TWO_FACTOR_COPY.on.statusLine).toMatch(/is on/i);
    expect(TWO_FACTOR_COPY.off.statusLine).toMatch(/is off/i);
  });

  test("the two states do not say the same thing", () => {
    for (const status of STATUSES) {
      expect(TWO_FACTOR_COPY[status].statusLine).not.toBe("");
      expect(TWO_FACTOR_COPY[status].detail).not.toBe("");
    }
    expect(TWO_FACTOR_COPY.on.detail).not.toBe(TWO_FACTOR_COPY.off.detail);
  });

  test("the password field is labelled and explains why it is there", () => {
    expect(TWO_FACTOR_PASSWORD_COPY.label).not.toBe("");
    expect(TWO_FACTOR_PASSWORD_COPY.hint).not.toBe("");
  });

  test("turning it off is confirmed, and the confirmation says there is no undo", () => {
    expect(TWO_FACTOR_DISABLE_CONFIRMATION.title).toMatch(/\?$/);
    expect(TWO_FACTOR_DISABLE_CONFIRMATION.message).toMatch(/cannot turn it back on/i);
    expect(TWO_FACTOR_DISABLE_CONFIRMATION.confirmLabel).not.toBe("");
    expect(TWO_FACTOR_DISABLE_CONFIRMATION.cancelLabel).not.toBe("");
  });

  test("it also says what happens to the backup codes somebody already has", () => {
    expect(TWO_FACTOR_DISABLE_CONFIRMATION.message).toMatch(/backup codes/i);
  });

  test("the warning says the codes are shown once and are to be stored now", () => {
    // The API answers with them in one response and no route reads them back,
    // so this sentence is the difference between a recovery path and a lost one.
    expect(BACKUP_CODES_COPY.warning).toMatch(/once/i);
    expect(BACKUP_CODES_COPY.warning).toMatch(/cannot be shown again/i);
    expect(BACKUP_CODES_COPY.warning).toMatch(/now/i);
  });

  test("and that the codes somebody had before have stopped working", () => {
    expect(BACKUP_CODES_COPY.warning).toMatch(/before/i);
  });

  test("the copy control is named for a screen reader too", () => {
    expect(BACKUP_CODES_COPY.copyLabel).not.toBe("");
    expect(BACKUP_CODES_COPY.copiedLabel).not.toBe(BACKUP_CODES_COPY.copyLabel);
    expect(BACKUP_CODES_COPY.copyAccessibilityLabel).not.toBe("");
  });
});
