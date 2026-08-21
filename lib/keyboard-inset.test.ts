import type { KeyboardEvent } from "react-native";

import {
  keyboardOverlap,
  residualKeyboardOverlap,
  revealScrollDelta,
} from "@/lib/keyboard-inset";

function showEvent(height: number, screenY = 0): KeyboardEvent {
  return {
    endCoordinates: { screenX: 0, screenY, width: 400, height },
  } as KeyboardEvent;
}

describe("residualKeyboardOverlap", () => {
  test("calculates positive overlap between content bottom and keyboard top", () => {
    expect(residualKeyboardOverlap(800, 500, 300)).toBe(300);
    expect(residualKeyboardOverlap(700, 500, 300)).toBe(200);
  });

  test("is zero when content clears the keyboard top", () => {
    expect(residualKeyboardOverlap(450, 500, 300)).toBe(0);
  });

  test("is capped by the reported height", () => {
    expect(residualKeyboardOverlap(900, 400, 300)).toBe(300);
  });

  test("never goes negative", () => {
    expect(residualKeyboardOverlap(300, 600, -50)).toBe(0);
  });
});

describe("keyboardOverlap", () => {
  test("reads the reported keyboard height when content bottom is omitted", () => {
    expect(keyboardOverlap(showEvent(312))).toBe(312);
  });

  test("calculates residual overlap when content bottom is supplied", () => {
    expect(keyboardOverlap(showEvent(312, 500), 800)).toBe(300);
    expect(keyboardOverlap(showEvent(312, 500), 500)).toBe(0);
  });

  test("is zero when there is no event", () => {
    expect(keyboardOverlap(null)).toBe(0);
    expect(keyboardOverlap(undefined)).toBe(0);
  });

  test("never goes negative on invalid coordinates", () => {
    expect(keyboardOverlap(showEvent(-40))).toBe(0);
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
