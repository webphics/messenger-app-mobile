import { readGoogleConfig } from "@/lib/google-config";

const WEB = "935513852405-nkjrlg9aoghevdo56bdpv1f3bcmcj74d.apps.googleusercontent.com";
const IOS = "935513852405-iosclientexample.apps.googleusercontent.com";

describe("a configured build", () => {
  test("Android needs only the web client", () => {
    expect(readGoogleConfig(WEB, undefined, "android")).toEqual({
      kind: "configured",
      oauth: { webClientId: WEB, iosClientId: null },
    });
  });

  test("iOS carries both, and the web one is still the audience", () => {
    expect(readGoogleConfig(WEB, IOS, "ios")).toEqual({
      kind: "configured",
      oauth: { webClientId: WEB, iosClientId: IOS },
    });
  });

  test("surrounding whitespace is not part of the identifier", () => {
    const config = readGoogleConfig(`  ${WEB}  `, undefined, "android");
    expect(config).toMatchObject({ oauth: { webClientId: WEB } });
  });
});

describe("a build that cannot offer Google says which variable is missing", () => {
  test.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("%s names the web client rather than taking the app down", (_label, value) => {
    const config = readGoogleConfig(value, value, "android");
    expect(config.kind).toBe("unconfigured");
    expect(config).toMatchObject({
      notice: expect.stringContaining("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
    });
  });

  // The one nobody would guess: without the web client there is no audience the
  // API will accept, so an iOS client on its own cannot sign anyone in.
  test("an iOS client with no web client to be the audience is still unconfigured", () => {
    expect(readGoogleConfig(undefined, IOS, "ios")).toMatchObject({
      kind: "unconfigured",
      notice: expect.stringContaining("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
    });
  });

  // The realistic half-configured state: the web client exists — it is shared
  // with the web client and the API — and nobody has made an iOS client yet.
  // Android developers are unaffected; an iOS one gets a named variable rather
  // than an app that will not start.
  test("iOS without its own client names that one, and only that one", () => {
    expect(readGoogleConfig(WEB, undefined, "ios")).toEqual({
      kind: "unconfigured",
      notice: expect.stringContaining("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
    });
  });

  test("the same build is fine on Android", () => {
    expect(readGoogleConfig(WEB, undefined, "android").kind).toBe("configured");
  });
});

describe("a build configured wrongly fails at import", () => {
  test("a web client that is not a client identifier", () => {
    expect(() => readGoogleConfig("not-a-client-id", undefined, "android")).toThrow(
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not a Google OAuth client ID/,
    );
  });

  // The mistake this catches is pasting the client *secret*, which is the field
  // next to the identifier in the Google console and looks nothing like one.
  test("a client secret pasted where the identifier goes", () => {
    expect(() =>
      readGoogleConfig("GOCSPX-aBcDeFgHiJkLmNoP", undefined, "android"),
    ).toThrow(/not the client secret/);
  });

  test("an iOS client that is not a client identifier, even on Android", () => {
    expect(() => readGoogleConfig(WEB, "nonsense", "android")).toThrow(
      /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not a Google OAuth client ID/,
    );
  });
});
