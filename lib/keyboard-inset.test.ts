import type { KeyboardEvent } from "react-native";

import {
  imeAbsorbedByWindowResize,
  keyboardOverlap,
  revealScrollDelta,
  screenWindowGap,
} from "@/lib/keyboard-inset";

function showEvent(height: number, screenY = 0): KeyboardEvent {
  return {
    endCoordinates: { screenX: 0, screenY, width: 400, height },
  } as KeyboardEvent;
}

describe("screenWindowGap", () => {
  test("is the positive screen-minus-window difference", () => {
    expect(screenWindowGap(800, 750)).toBe(50);
    expect(screenWindowGap(800, 800)).toBe(0);
    expect(screenWindowGap(800, 900)).toBe(0);
  });
});

describe("imeAbsorbedByWindowResize", () => {
  test("is zero when the window did not shrink further for the IME", () => {
    // Edge-to-edge APK: rest gap (nav) stays put when keyboard opens.
    expect(imeAbsorbedByWindowResize(48, 48)).toBe(0);
  });

  test("is the extra shrink once Expo Go / resize mode absorbs the IME", () => {
    expect(imeAbsorbedByWindowResize(48 + 312, 48)).toBe(312);
  });
});

describe("keyboardOverlap", () => {
  test("reads the reported keyboard height when nothing was absorbed", () => {
    expect(keyboardOverlap(showEvent(312))).toBe(312);
  });

  test("subtracts what the window resize already absorbed", () => {
    expect(keyboardOverlap(showEvent(312), 312)).toBe(0);
    expect(keyboardOverlap(showEvent(312), 100)).toBe(212);
  });

  test("is zero when there is no event", () => {
    expect(keyboardOverlap(null)).toBe(0);
    expect(keyboardOverlap(undefined)).toBe(0);
  });

  test("never goes negative", () => {
    expect(keyboardOverlap(showEvent(-40))).toBe(0);
    expect(keyboardOverlap(showEvent(200), 400)).toBe(0);
  });

  test("ignores screenY, which is window-relative and edge-to-edge unsafe", () => {
    // The status-bar offset that broke KeyboardAvoidingView lives in screenY;
    // height alone is already net of the system bars on Android.
    expect(keyboardOverlap(showEvent(312, 600))).toBe(
      keyboardOverlap(showEvent(312, 0)),
    );
  });
});

describe("revealScrollDelta", () => {
  test("scrolls a clipped field clear of the keyboard, plus a margin", () => {
    expect(revealScrollDelta(700, 640, 16)).toBe(76);
  });

  test("leaves a field that already clears the viewport alone", () => {
    expect(revealScrollDelta(500, 640, 16)).toBe(0);
  });

  test("treats the margin as part of the field", () => {
    expect(revealScrollDelta(640, 640, 16)).toBe(16);
    expect(revealScrollDelta(630, 640, 16)).toBe(6);
  });
});
