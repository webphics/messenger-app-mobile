import { Alert } from "react-native";

/**
 * Ask before ending a session.
 *
 * Signing out is destructive in the way AGENTS.md means: it discards the
 * credential and everything derived from it, there is no undo window to offer,
 * and getting back in costs a password or a wait for an email. Both places that
 * offer it — Settings and the Unreachable screen — are a single tap on a
 * danger-styled control, and on Unreachable that control sits next to the one
 * someone actually wants.
 *
 * One function rather than a dialog in each screen so the wording cannot drift,
 * and so the destructive button is marked as such on iOS in both places.
 *
 * Resolves true when it should go ahead. Never rejects: dismissing the sheet is
 * an answer, not a failure.
 */
export function confirmSignOut(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Sign out?",
      "You'll need to sign in again to get back to your conversations.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Sign out", style: "destructive", onPress: () => resolve(true) },
      ],
      // Android's back gesture dismisses without touching a button, and a
      // dismissal that never resolved would leave the caller's promise hanging.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
