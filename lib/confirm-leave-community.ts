import { Alert } from "react-native";

/**
 * Ask before leaving a Community.
 *
 * The only administering control this screen offers is leaving it, and that is
 * enough to be worth a pause: it drops every Group the person joined through
 * it out of view, on this device, with no undo. See `confirmSignOut` for the
 * same shape of question asked elsewhere in this app.
 *
 * Resolves true when it should go ahead. Never rejects: dismissing the sheet is
 * an answer, not a failure.
 */
export function confirmLeaveCommunity(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Leave ${name}?`,
      "You’ll stop seeing its groups and announcements on this device.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Leave", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
