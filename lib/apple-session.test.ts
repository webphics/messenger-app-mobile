import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { isAppleSignInAvailable } from "@/lib/apple-session";

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const isAvailable = AppleAuthentication.isAvailableAsync as jest.MockedFunction<
  typeof AppleAuthentication.isAvailableAsync
>;
const realOS = Platform.OS;

function runOn(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

afterEach(() => {
  runOn(realOS);
  jest.clearAllMocks();
});

// The sign-in form draws the Apple button on this answer alone, so this is what
// keeps it off Android: there it must be no, whatever the library would say.
test("Android is never offered Apple, and the library is not even asked", async () => {
  runOn("android");

  await expect(isAppleSignInAvailable()).resolves.toBe(false);
  expect(isAvailable).not.toHaveBeenCalled();
});

test("iOS is offered Apple when the device can show the sheet", async () => {
  runOn("ios");

  await expect(isAppleSignInAvailable()).resolves.toBe(true);
});

test.each([
  ["cannot", async () => false],
  ["fails to answer", async () => Promise.reject(new Error("no native module"))],
])("an iOS device that %s is not offered Apple", async (_label, answer) => {
  runOn("ios");
  isAvailable.mockImplementationOnce(answer);

  await expect(isAppleSignInAvailable()).resolves.toBe(false);
});
