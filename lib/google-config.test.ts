import { readGoogleConfig } from "@/lib/google-config";

const WEB = "935513852405-nkjrlg9aoghevdo56bdpv1f3bcmcj74d.apps.googleusercontent.com";
const IOS = "935513852405-iosclientexample.apps.googleusercontent.com";

test("Android needs only the web client, iOS carries both", () => {
  expect(readGoogleConfig(WEB, undefined, "android")).toEqual({
    kind: "configured",
    oauth: { webClientId: WEB, iosClientId: null },
  });
  expect(readGoogleConfig(WEB, IOS, "ios")).toEqual({
    kind: "configured",
    oauth: { webClientId: WEB, iosClientId: IOS },
  });
});

test("no web client is unconfigured, whatever else is set", () => {
  expect(readGoogleConfig(undefined, IOS, "ios")).toMatchObject({
    kind: "unconfigured",
    notice: expect.stringContaining("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
  });
});

test("a client secret pasted where the identifier goes throws", () => {
  expect(() => readGoogleConfig("GOCSPX-aBcDeFgHiJkLmNoP", undefined, "android")).toThrow(
    /not the client secret/,
  );
});
