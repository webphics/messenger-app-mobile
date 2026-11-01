import {
  BACKUP_CODE_REQUIRED_NOTICE,
  BACKUP_CODE_SHAPE_NOTICE,
  CODE_REQUIRED_NOTICE,
  CODE_SHAPE_NOTICE,
  codeError,
  normaliseCode,
} from "@/lib/two-factor-challenge";

describe("normaliseCode", () => {
  test("takes the digits out of a code pasted with the space its app shows", () => {
    expect(normaliseCode("123 456", "totp")).toBe("123456");
  });

  test("a backup code keeps its case, because the API compares it exactly", () => {
    expect(normaliseCode(" d4m39-TKO73 ", "backup-code")).toBe("d4m39-TKO73");
  });

  test("a backup code typed without its hyphen gets it back", () => {
    expect(normaliseCode("d4m39TKO73", "backup-code")).toBe("d4m39-TKO73");
  });
});

describe("codeError", () => {
  test("an empty field asks for the code", () => {
    expect(codeError("   ", "totp")).toBe(CODE_REQUIRED_NOTICE);
  });

  test.each(["12345", "12345a"])("refuses %p before a request is made", (typed) => {
    expect(codeError(typed, "totp")).toBe(CODE_SHAPE_NOTICE);
  });

  test("accepts a pasted code with its space", () => {
    expect(codeError("123 456", "totp")).toBeNull();
  });
});

describe("codeError for a backup code", () => {
  test("an empty field asks for a backup code rather than an authenticator code", () => {
    expect(codeError("", "backup-code")).toBe(BACKUP_CODE_REQUIRED_NOTICE);
  });

  test.each(["d4m39-TKO7", "d4m39_TKO73", "123456"])(
    "refuses %p before a request is made",
    (typed) => {
      expect(codeError(typed, "backup-code")).toBe(BACKUP_CODE_SHAPE_NOTICE);
    },
  );

  test.each(["d4m39-TKO73", "d4m39TKO73", "d4m39 - TKO73"])("accepts %p", (typed) => {
    expect(codeError(typed, "backup-code")).toBeNull();
  });
});
