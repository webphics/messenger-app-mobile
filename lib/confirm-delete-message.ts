import { Alert } from 'react-native'

import { deleteConfirmationText } from '@/lib/message-delete'
import type { Message } from '@/lib/types'

/**
 * Ask before deleting a message for everyone.
 *
 * Worth a pause because there is no way back: the API removes it, its
 * attachments and every quote of it for everybody in the thread. The wording is
 * `deleteConfirmationText`, which says so for the attachments too. Same shape
 * as `confirmBlock`.
 *
 * Resolves true when it should go ahead. Never rejects.
 */
export function confirmDeleteMessage(message: Pick<Message, 'attachments'>): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Delete message?',
      deleteConfirmationText(message),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}
