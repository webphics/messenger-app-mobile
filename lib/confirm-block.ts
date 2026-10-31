import { Alert } from 'react-native'

/**
 * Ask before blocking somebody.
 *
 * Worth a pause because it takes everything they wrote off this person's
 * screens at once. It is not final — Settings lists everybody blocked and
 * unblocks them — so the question says where the way back is rather than
 * calling it permanent. Same shape as `confirmLeaveCommunity`.
 *
 * Resolves true when it should go ahead. Never rejects.
 */
export function confirmBlock(name: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      `Block ${name}?`,
      'You won’t see their posts or messages, and they can’t start a new conversation with you. They aren’t told. You can unblock them in Settings.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Block', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

/** Ask before unblocking, from Settings. */
export function confirmUnblock(name: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      `Unblock ${name}?`,
      'Their posts and messages will show again, and they can message you.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Unblock', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}
