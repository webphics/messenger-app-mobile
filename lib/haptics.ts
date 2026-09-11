import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Safe haptic feedback triggers. Errors and platforms with no motor behind them
 * are swallowed rather than surfaced — a missing buzz is not worth a throw.
 *
 * When one is earned, because the budget here is spent by restraint and the way
 * it goes wrong is a hundred small buzzes rather than one badly chosen. A
 * haptic belongs to a moment that is *rare* and is either
 *
 *   - a gesture crossing a threshold with no other moment of truth — a long
 *     press taking, a swipe passing the point where it would commit; or
 *   - an outcome the person may not be watching, or cannot see at all — a
 *     sign-in coming back, a copy to the clipboard, a recording ending.
 *
 * Everything else goes without. A tap that visibly changes the screen, opens a
 * picker, sends a message or switches a tab is not short of feedback, and one
 * on a path reached dozens of times a day is the reason somebody turns the
 * setting off — taking the two cases above with it, which are the ones that
 * were worth having. Never the only signal for anything either: the motor is
 * off system-wide for plenty of people and silent on much of Android.
 */

export function hapticLight() {
  if (Platform.OS === "web") return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // ignore
  }
}

export function hapticMedium() {
  if (Platform.OS === "web") return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // ignore
  }
}

export function hapticSelection() {
  if (Platform.OS === "web") return;
  try {
    void Haptics.selectionAsync();
  } catch {
    // ignore
  }
}

export function hapticSuccess() {
  if (Platform.OS === "web") return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

export function hapticWarning() {
  if (Platform.OS === "web") return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // ignore
  }
}
