// Reached through its build path deliberately: this is expo-router's own deep
// link parser, and the point of the test below is that the real one agrees.
import { extractExpoPathFromURL } from "expo-router/build/fork/extractPathFromURL";

import {
  MAGIC_LINK_PATH,
  magicLinkUrl,
  readMagicLinkOrigin,
} from "@/lib/magic-link-config";

describe("reading the configured origin", () => {
  test("an HTTPS origin is taken as it stands", () => {
    expect(readMagicLinkOrigin("https://app.example.com", "joychat")).toBe(
      "https://app.example.com",
    );
  });

  test("a trailing slash is stripped the way the API strips it", () => {
    expect(readMagicLinkOrigin("https://app.example.com/", "joychat")).toBe(
      "https://app.example.com",
    );
  });

  test("a custom scheme is as valid a target as a domain", () => {
    expect(readMagicLinkOrigin("joychat://", undefined)).toBe("joychat:");
  });

  test("surrounding whitespace is not part of the value", () => {
    expect(readMagicLinkOrigin("  https://app.example.com  ", null)).toBe(
      "https://app.example.com",
    );
  });

  test("the configured value wins over the app's own scheme", () => {
    expect(readMagicLinkOrigin("https://app.example.com", "joychat")).not.toContain("joychat");
  });
});

describe("falling back to the app's scheme", () => {
  test("an unset variable falls back rather than leaving the flow dead", () => {
    expect(readMagicLinkOrigin(undefined, "joychat")).toBe("joychat:");
  });

  test("an empty variable is the same as an unset one", () => {
    expect(readMagicLinkOrigin("   ", "joychat")).toBe("joychat:");
  });

  test("app config may list several schemes; the first is the app's own", () => {
    expect(readMagicLinkOrigin(undefined, ["joychat", "com.zeestglobal.joychat"])).toBe("joychat:");
  });
});

describe("refusing to guess", () => {
  const unusable: [string, string | undefined][] = [
    ["a bare host routes nowhere", "app.example.com"],
    ["a path is not an origin", "/auth/magic-link"],
    ["a scheme with no authority is not one either", "joychat:"],
    ["a query cannot be part of an origin the API appends to", "https://app.example.com?a=b"],
  ];

  test.each(unusable)("%s", (_label, configured) => {
    expect(readMagicLinkOrigin(configured, "joychat")).toBeNull();
  });

  test("a bad value is not quietly swapped for the scheme fallback", () => {
    // Falling back here would send a link that works while hiding that the
    // configured origin — the one production depends on — is wrong.
    expect(readMagicLinkOrigin("app.example.com", "joychat")).toBeNull();
  });

  test("no configuration and no scheme leaves nothing to send", () => {
    expect(readMagicLinkOrigin(undefined, undefined)).toBeNull();
    expect(readMagicLinkOrigin(undefined, [])).toBeNull();
  });
});

describe("the link the API will build", () => {
  test("an HTTPS origin produces the route this app answers to", () => {
    expect(magicLinkUrl("https://app.example.com", "abc123")).toBe(
      `https://app.example.com${MAGIC_LINK_PATH}?token=abc123`,
    );
  });

  test("a custom scheme produces the same route", () => {
    expect(magicLinkUrl("joychat:", "abc123")).toBe(`joychat:${MAGIC_LINK_PATH}?token=abc123`);
  });

  test("a token is escaped, so a link cannot smuggle a second parameter", () => {
    expect(magicLinkUrl("joychat:", "a&callbackURL=b")).toBe(
      `joychat:${MAGIC_LINK_PATH}?token=a%26callbackURL%3Db`,
    );
  });
});

describe("the link and the route it has to reach", () => {
  // The one claim in this feature that spans three places at once — what this
  // client sends as an origin, how the API joins a path onto it, and how
  // expo-router turns the result back into a route. Each half is obviously
  // right on its own; the join is where a wrong origin would look fine and open
  // nothing, which is not a thing a phone tells you about.
  const origins: [string, string | undefined][] = [
    ["the custom scheme this ships with", "joychat://"],
    ["a production HTTPS origin", "https://app.example.com"],
    ["an HTTPS origin someone left a slash on", "https://app.example.com/"],
    ["the scheme fallback, when nothing is configured", undefined],
  ];

  test.each(origins)("%s reaches app/auth/magic-link.tsx", (_label, configured) => {
    const origin = readMagicLinkOrigin(configured, "joychat");
    expect(origin).not.toBeNull();

    expect(extractExpoPathFromURL([], magicLinkUrl(origin!, "abc123"))).toBe(
      "auth/magic-link?token=abc123",
    );
  });
});
