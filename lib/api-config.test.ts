import { readApiBaseUrl } from "@/lib/api-config";

describe("readApiBaseUrl", () => {
  test("strips trailing slashes so callers can join paths directly", () => {
    expect(readApiBaseUrl("http://10.0.2.2:8080/")).toBe("http://10.0.2.2:8080");
    expect(readApiBaseUrl("http://10.0.2.2:8080///")).toBe("http://10.0.2.2:8080");
  });

  test.each([undefined])("refuses a missing value (%p) by name", (raw) => {
    expect(() => readApiBaseUrl(raw)).toThrow("EXPO_PUBLIC_API_URL is not set");
  });

  test.each(["10.0.2.2:8080"])(
    "refuses %p as not an http or https URL, quoting what was configured",
    (raw) => {
      expect(() => readApiBaseUrl(raw)).toThrow("must be an http or https URL");
      expect(() => readApiBaseUrl(raw)).toThrow(`"${raw}"`);
    },
  );

  // React Native's own URL shim never throws for a single-argument call, so these
  // have to be rejected without depending on a WHATWG constructor being present.
  test.each(["http://"])(
    "refuses %p as not a reachable host",
    (raw) => {
      expect(() => readApiBaseUrl(raw)).toThrow("is not a valid URL");
    },
  );
});
