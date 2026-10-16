import { Alert } from "react-native";

/**
 * The last question before an account is deleted. The screen behind the
 * Settings row explains what goes and what stays; this is the second step, the
 * one that cannot be reached by a single stray tap.
 *
 * Resolves true when it should go ahead. Never rejects, for the reason
 * `confirmSignOut` gives: a dismissal is an answer.
 */
export function confirmDeleteAccount(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Delete your account?",
      "Your account is deleted at once and you are signed out on every device. This can't be undone.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
