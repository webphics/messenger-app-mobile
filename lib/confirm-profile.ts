import { Alert } from "react-native";

/**
 * Ask before removing the profile photo.
 *
 * Destructive in AGENTS.md's sense: the API deletes the stored file as it
 * clears the field, so there is no undo, and getting it back means finding the
 * photo again. Resolves true when it should go ahead; never rejects, since a
 * dismissal is an answer. `lib/confirm-sign-out`'s shape.
 */
export function confirmRemovePhoto(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Remove your photo?",
      "Your initials will show in its place, here and on the web.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Remove", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Ask before leaving the profile with changes nobody saved.
 *
 * Resolves true to discard them. Discard is the one that has to be chosen, so
 * a stray tap keeps the edits rather than losing them.
 */
export function confirmDiscardProfile(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Discard your changes?",
      "Your profile has not been saved.",
      [
        { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
        { text: "Discard", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
