import {
  CODE_REQUIRED_NOTICE,
  CODE_SHAPE_NOTICE,
  codeError,
  normaliseCode,
} from "@/lib/two-factor-challenge";

describe("normaliseCode", () => {
  test("takes the digits out of a code pasted with the space its app shows", () => {
    expect(normaliseCode("123 456")).toBe("123456");
  });
});

describe("codeError", () => {
  test("an empty field asks for the code", () => {
    expect(codeError("   ")).toBe(CODE_REQUIRED_NOTICE);
  });

  test.each(["12345", "12345a"])("refuses %p before a request is made", (typed) => {
    expect(codeError(typed)).toBe(CODE_SHAPE_NOTICE);
  });

  test("accepts a pasted code with its space", () => {
    expect(codeError("123 456")).toBeNull();
  });
});
