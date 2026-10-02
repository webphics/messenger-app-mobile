// Reached through its build path deliberately: this is expo-router's own deep
// link parser, and the point of the test below is that the real one agrees.
import { extractExpoPathFromURL } from "expo-router/build/fork/extractPathFromURL";

import {
  MAGIC_LINK_PATH,
  magicLinkUrl,
  readMagicLinkOrigin,
} from "@/lib/magic-link-config";

describe("reading the configured origin", () => {
  test("an HTTPS origin is taken as it stands, minus a trailing slash", () => {
    expect(readMagicLinkOrigin("https://app.example.com/", "chatroute")).toBe(
      "https://app.example.com",
    );
  });

  test("an unset variable falls back to the app's own scheme", () => {
    expect(readMagicLinkOrigin(undefined, "chatroute")).toBe("chatroute:");
  });

  test.each([
    ["a bare host routes nowhere", "app.example.com"],
    ["a query cannot be part of an origin the API appends to", "https://app.example.com?a=b"],
  ])("%s", (_label, configured) => {
    expect(readMagicLinkOrigin(configured, "chatroute")).toBeNull();
  });
});

test("a token is escaped, so a link cannot smuggle a second parameter", () => {
  expect(magicLinkUrl("chatroute:", "a&callbackURL=b")).toBe(
    `chatroute:${MAGIC_LINK_PATH}?token=a%26callbackURL%3Db`,
  );
});

// What this client sends as an origin, how the API joins a path onto it, and how
// expo-router turns the result back into a route: the join is where a wrong
// origin would look fine and open nothing.
test.each([
  ["the custom scheme this ships with", "chatroute://"],
  ["a production HTTPS origin", "https://app.example.com"],
])("%s reaches app/auth/magic-link.tsx", (_label, configured) => {
  const origin = readMagicLinkOrigin(configured, "chatroute");
  expect(origin).not.toBeNull();

  expect(extractExpoPathFromURL([], magicLinkUrl(origin!, "abc123"))).toBe(
    "auth/magic-link?token=abc123",
  );
});
