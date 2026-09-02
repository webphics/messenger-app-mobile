import { Alert } from "react-native";

import { confirmSignOut } from "@/lib/confirm-sign-out";

type AlertButton = { text?: string; style?: string; onPress?: () => void };
type AlertOptions = { onDismiss?: () => void };

/**
 * The dialog is native, so the test drives it the way a person would: find the
 * button by its label and press it. What matters is the promise's answer — a
 * `true` that was never confirmed would sign someone out on a Cancel.
 */
function lastAlert(): { buttons: AlertButton[]; options: AlertOptions } {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  return { buttons: call?.[2] ?? [], options: call?.[3] ?? {} };
}

function press(label: string): void {
  lastAlert().buttons.find((button) => button.text === label)?.onPress?.();
}

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("confirming resolves true", async () => {
  const answer = confirmSignOut();
  press("Sign out");
  await expect(answer).resolves.toBe(true);
});

test("cancelling resolves false", async () => {
  const answer = confirmSignOut();
  press("Cancel");
  await expect(answer).resolves.toBe(false);
});

test("dismissing without pressing anything resolves false", async () => {
  const answer = confirmSignOut();
  lastAlert().options.onDismiss?.();
  await expect(answer).resolves.toBe(false);
});

test("the destructive action is marked as such, and Cancel as the cancel", () => {
  void confirmSignOut();
  const { buttons } = lastAlert();

  expect(buttons.find((button) => button.text === "Sign out")?.style).toBe("destructive");
  expect(buttons.find((button) => button.text === "Cancel")?.style).toBe("cancel");
});
