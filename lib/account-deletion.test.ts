import {
  REAUTHENTICATION_REQUIRED,
  deletionNotice,
  parseDeletion,
} from "@/lib/account-deletion";

describe("deletionNotice", () => {
  it("offers a fresh sign-in when the session is too old", () => {
    expect(
      deletionNotice({
        kind: "refused",
        code: REAUTHENTICATION_REQUIRED,
        message: "For your security, sign in again before deleting your account.",
      }),
    ).toEqual({
      kind: "reauthenticate",
      message: "For your security, sign in again before deleting your account.",
    });
  });

  it.each(["last_admin_required", "account_not_deletable", undefined])(
    "shows the API's sentence for a final refusal (%s)",
    (code) => {
      expect(deletionNotice({ kind: "refused", code, message: "No." })).toEqual({
        kind: "refused",
        message: "No.",
      });
    },
  );

  it("says nothing was deleted when the server could not be reached", () => {
    expect(deletionNotice({ kind: "unreachable" })).toMatchObject({ kind: "refused" });
  });

  it("sends an unreadable success back to sign-in", () => {
    expect(deletionNotice({ kind: "malformed" })).toMatchObject({ kind: "reauthenticate" });
  });

  it("leaves an ended session to the expiry path", () => {
    expect(deletionNotice({ kind: "unauthorised" })).toBeNull();
  });
});

describe("parseDeletion", () => {
  it("reads the route's data", () => {
    expect(parseDeletion({ deleted: true })).toBe(true);
  });

  it.each([null, undefined, true, {}, { deleted: false }, { deleted: "true" }])(
    "refuses %p",
    (data) => {
      expect(parseDeletion(data)).toBeNull();
    },
  );
});
