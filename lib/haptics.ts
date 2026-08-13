import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Safe haptic feedback triggers.
 * Gracefully ignores errors or unsupported platforms (e.g. Web).
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
