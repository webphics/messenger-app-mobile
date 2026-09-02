import { readGoogleOAuth } from "@/lib/google-config";

const WEB = "123456789012-webabc.apps.googleusercontent.com";
const IOS = "123456789012-iosabc.apps.googleusercontent.com";

describe("a configured build", () => {
  test("Android needs only the web client", () => {
    expect(readGoogleOAuth(WEB, undefined, "android")).toEqual({
      webClientId: WEB,
      iosClientId: null,
    });
  });

  test("iOS carries both, and the web one is still the audience", () => {
    expect(readGoogleOAuth(WEB, IOS, "ios")).toEqual({
      webClientId: WEB,
      iosClientId: IOS,
    });
  });

  test("surrounding whitespace is not part of the identifier", () => {
    expect(readGoogleOAuth(`  ${WEB}  `, undefined, "android")?.webClientId).toBe(WEB);
  });
});

describe("a build with nothing configured", () => {
  test.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("%s reports null rather than taking the app down", (_label, value) => {
    expect(readGoogleOAuth(value, value, "android")).toBeNull();
  });
});

describe("a build configured wrongly fails at import", () => {
  test("a web client that is not a client identifier", () => {
    expect(() => readGoogleOAuth("not-a-client-id", undefined, "android")).toThrow(
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not a Google OAuth client ID/,
    );
  });

  // The mistake this catches is pasting the client *secret*, which is the field
  // next to the identifier in the Google console and looks nothing like one.
  test("a client secret pasted where the identifier goes", () => {
    expect(() =>
      readGoogleOAuth("GOCSPX-aBcDeFgHiJkLmNoP", undefined, "android"),
    ).toThrow(/not the client secret/);
  });

  test("an iOS client that is not a client identifier, even on Android", () => {
    expect(() => readGoogleOAuth(WEB, "nonsense", "android")).toThrow(
      /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not a Google OAuth client ID/,
    );
  });

  // Half-configured is a mistake, not an honest "Google is not set up here":
  // it would show an enabled button that dies at the account sheet.
  test("iOS without its own client", () => {
    expect(() => readGoogleOAuth(WEB, undefined, "ios")).toThrow(
      /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set/,
    );
  });

  // The one nobody would guess: without the web client there is no audience the
  // API will accept, so an iOS-only configuration cannot sign anyone in.
  test("an iOS client with no web client to be the audience", () => {
    expect(() => readGoogleOAuth(undefined, IOS, "ios")).toThrow(
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not/,
    );
  });
});
