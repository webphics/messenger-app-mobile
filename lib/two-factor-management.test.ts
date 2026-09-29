import {
  checkTwoFactorPassword,
  twoFactorActions,
  type TwoFactorAccount,
} from "@/lib/two-factor-management";

/**
 * One account per state is enough: the two questions (is two-factor on, does
 * the account have a password) are independent by design.
 */
const ON: TwoFactorAccount = { twoFactorEnabled: true, hasPassword: true };
const OFF: TwoFactorAccount = { twoFactorEnabled: false, hasPassword: false };
const ACCOUNTS = [ON, OFF];

describe("what the screen offers", () => {
  test("two-factor on offers turning it off and replacing the codes, and nothing else", () => {
    expect(twoFactorActions(ON).map((action) => action.kind)).toEqual([
      "disable",
      "regenerate-backup-codes",
    ]);
  });

  test("two-factor off offers nothing at all", () => {
    expect(twoFactorActions(OFF)).toEqual([]);
  });

  test("turning it off is the destructive one, so it is confirmed first", () => {
    const [disable, regenerate] = twoFactorActions(ON);

    expect(disable?.destructive).toBe(true);
    // Not destructive in the same way: the replacement arrives on the same
    // screen in the same breath, so what it takes away is visibly returned.
    expect(regenerate?.destructive).toBe(false);
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
});

describe("the body each account sends", () => {
  test("an empty field on an account that has a password is caught before the request", () => {
    const check = checkTwoFactorPassword({ hasPassword: true }, "");

    expect(check.error).toBeTruthy();
    expect(check.password).toBeNull();
  });

  test("surrounding whitespace is gone before it is sent", () => {
    // The API's `baseString` trims before anything else sees the value.
    expect(
      checkTwoFactorPassword({ hasPassword: true }, "  hunter2  ").password,
    ).toBe("hunter2");
  });
});
