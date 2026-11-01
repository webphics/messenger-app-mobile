import {
  checkTwoFactorPassword,
  groupSetupKey,
  twoFactorActions,
  type TwoFactorAccount,
} from "@/lib/two-factor-management";

/**
 * One account per state is enough: the two questions (is two-factor on, does
 * the account have a password) are independent by design.
 */
const ON: TwoFactorAccount = { twoFactorEnabled: true, hasPassword: true };
const OFF: TwoFactorAccount = { twoFactorEnabled: false, hasPassword: false };

describe("what the screen offers", () => {
  test("two-factor on offers turning it off and replacing the codes, and nothing else", () => {
    expect(twoFactorActions(ON).map((action) => action.kind)).toEqual([
      "disable",
      "regenerate-backup-codes",
    ]);
  });

  test("two-factor off offers turning it on, and nothing else", () => {
    expect(twoFactorActions(OFF).map((action) => action.kind)).toEqual(["enable"]);
  });

  test("turning it off is the destructive one, so it is confirmed first", () => {
    const [disable, regenerate] = twoFactorActions(ON);

    expect(disable?.destructive).toBe(true);
    // Not destructive in the same way: the replacement arrives on the same
    // screen in the same breath, so what it takes away is visibly returned.
    expect(regenerate?.destructive).toBe(false);
  });
});

describe("turning two-factor on", () => {
  // Ticket 08. Withheld while `POST /auth/two-factor/verify-backup-code` was
  // behind `AuthGuard`, which left a backup code unredeemable at sign-in, the
  // one moment it exists for. The API dropped the guard and the sign-in
  // challenge takes a backup code now, so the spare key works. See ADR-0013
  // and issue 02.
  test("is offered only where it is off", () => {
    expect(twoFactorActions(OFF).some((action) => action.kind === "enable")).toBe(true);
    expect(twoFactorActions(ON).some((action) => action.kind === "enable")).toBe(false);
  });

  test("is labelled as turning it on, to the eye and to a screen reader", () => {
    const [enable] = twoFactorActions(OFF);

    expect(enable?.label).toMatch(/turn on/i);
    expect(enable?.accessibilityLabel).toMatch(/turn on/i);
  });

  test("is not confirmed as destructive, since it takes nothing away", () => {
    expect(twoFactorActions(OFF)[0]?.destructive).toBe(false);
  });

  test("nothing on an account that has it on is labelled as turning it on", () => {
    for (const action of twoFactorActions(ON)) {
      expect(action.label).not.toMatch(/turn on|enable|set up|switch on/i);
      expect(action.accessibilityLabel).not.toMatch(/turn on|enable|set up|switch on/i);
    }
  });

  test("the setup key is drawn in fours, as authenticator apps show it", () => {
    expect(groupSetupKey("JMYXUODFHBIF6X2R")).toBe("JMYX UODF HBIF 6X2R");
    expect(groupSetupKey("JMYXUO")).toBe("JMYX UO");
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
