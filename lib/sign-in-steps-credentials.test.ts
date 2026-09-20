import type { AccountState } from "@/lib/account-state";
import {
  CREDENTIALS_COPY,
  credentialsMode,
  showsPasswordField,
} from "@/lib/sign-in-steps";

const state = (exists: boolean, hasPassword: boolean): AccountState => ({
  exists,
  hasPassword,
});

describe("which of three things step two is about", () => {
  test("an account with a password asks for it", () => {
    expect(credentialsMode(state(true, true))).toBe("password");
  });

  test("an account without one is sent to the link", () => {
    expect(credentialsMode(state(true, false))).toBe("no-password");
  });

  test("an identifier nobody holds is sent to the link too", () => {
    expect(credentialsMode(state(false, false))).toBe("new-account");
  });
});

describe("the password field", () => {
  test("is drawn only for an account that has one", () => {
    expect(showsPasswordField("password")).toBe(true);
    expect(showsPasswordField("no-password")).toBe(false);
    expect(showsPasswordField("new-account")).toBe(false);
  });
});

describe("the two link-only modes are worded apart", () => {
  test("they draw the same controls", () => {
    expect(showsPasswordField("no-password")).toBe(
      showsPasswordField("new-account"),
    );
  });

  test("but never say the same thing", () => {
    // "your account has no password" and "you have no account" are different
    // news. One line covering both would be useless to either person.
    expect(CREDENTIALS_COPY["no-password"].title).not.toBe(
      CREDENTIALS_COPY["new-account"].title,
    );
    expect(CREDENTIALS_COPY["no-password"].description).not.toBe(
      CREDENTIALS_COPY["new-account"].description,
    );
  });

  test("every mode has copy", () => {
    for (const mode of ["password", "no-password", "new-account"] as const) {
      expect(CREDENTIALS_COPY[mode].title).not.toBe("");
      expect(CREDENTIALS_COPY[mode].description).not.toBe("");
    }
  });
});
