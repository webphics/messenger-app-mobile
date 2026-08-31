import { API_BASE_URL, readApiBaseUrl } from "@/lib/api-config";

describe("readApiBaseUrl", () => {
  test("accepts an http or https origin", () => {
    expect(readApiBaseUrl("http://10.0.2.2:8080")).toBe("http://10.0.2.2:8080");
    expect(readApiBaseUrl("https://api.example.com")).toBe("https://api.example.com");
  });

  test("strips trailing slashes so callers can join paths directly", () => {
    expect(readApiBaseUrl("http://10.0.2.2:8080/")).toBe("http://10.0.2.2:8080");
    expect(readApiBaseUrl("http://10.0.2.2:8080///")).toBe("http://10.0.2.2:8080");
  });

  test("keeps a base path", () => {
    expect(readApiBaseUrl("https://example.com/api/")).toBe("https://example.com/api");
  });

  test("trims surrounding whitespace a .env file picked up", () => {
    expect(readApiBaseUrl("  http://10.0.2.2:8080  ")).toBe("http://10.0.2.2:8080");
  });

  test.each([undefined, "", "   "])("refuses a missing value (%p) by name", (raw) => {
    expect(() => readApiBaseUrl(raw)).toThrow("EXPO_PUBLIC_API_URL is not set");
  });

  test.each(["10.0.2.2:8080", "ws://10.0.2.2:8080", "just some words"])(
    "refuses %p as not an http or https URL, quoting what was configured",
    (raw) => {
      expect(() => readApiBaseUrl(raw)).toThrow("must be an http or https URL");
      expect(() => readApiBaseUrl(raw)).toThrow(`"${raw}"`);
    },
  );

  // React Native's own URL shim never throws for a single-argument call, so these
  // have to be rejected without depending on a WHATWG constructor being present.
  test.each([
    "http://",
    "https:// space.example.com",
    "http://host with spaces/api",
    "http://example.com/api#frag",
    "http://example.com/api?q=1",
  ])("refuses %p as not a reachable host", (raw) => {
    expect(() => readApiBaseUrl(raw)).toThrow("is not a valid URL");
  });

  test("every refusal points at the emulator address", () => {
    for (const raw of [undefined, "nonsense", "ftp://example.com", "http://"]) {
      expect(() => readApiBaseUrl(raw)).toThrow("10.0.2.2:8080");
    }
  });

  test("the exported constant is resolved at import", () => {
    expect(API_BASE_URL).toBe(readApiBaseUrl(process.env.EXPO_PUBLIC_API_URL));
  });
});
