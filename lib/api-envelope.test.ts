import { asRecord, CSRF_REFUSED_CODE } from "@/lib/api-envelope";

describe("asRecord", () => {
  test("passes an object through", () => {
    const body = { code: "csrf_invalid", message: "Invalid CSRF token." };
    expect(asRecord(body)).toBe(body);
  });

  test("passes an empty object through — no fields is a shape, not a failure", () => {
    expect(asRecord({})).toEqual({});
  });

  /**
   * The subtle one. `typeof [] === "object"`, so without the array check a JSON
   * array would answer `.code` and `.data` with `undefined` and be read as an
   * object that merely happens to be missing every field — which is how a
   * malformed payload turns into a confident wrong answer.
   */
  test("rejects an array rather than letting it answer to field reads", () => {
    expect(asRecord([])).toBeNull();
    expect(asRecord([{ code: "csrf_invalid" }])).toBeNull();
  });

  test.each([null, undefined, "a string", 42, true])("rejects %p", (value) => {
    expect(asRecord(value)).toBeNull();
  });
});

describe("CSRF_REFUSED_CODE", () => {
  test("is the code the API's guard actually sends", () => {
    // `csrf.error.ts`: `forbiddenError('csrf_invalid', INVALID_CSRF_MESSAGE)`.
    // Both readers of a body — the transport and the interpreters — key off this
    // one string, so it is worth pinning to the server's spelling.
    expect(CSRF_REFUSED_CODE).toBe("csrf_invalid");
  });
});
