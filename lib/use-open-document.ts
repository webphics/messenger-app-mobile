import { useCallback, useState } from 'react'
import { Alert, Linking } from 'react-native'
import * as Sharing from 'expo-sharing'

import { ensureCachedFile } from '@/lib/attachment-cache'
import type { AttachmentView } from '@/lib/types'

export type OpenDocument = {
  /** Hand the document to whatever on this device can read it. */
  open: () => void
  /** True from the tap until the reader has it, so a row can say it is working. */
  opening: boolean
}

/**
 * Opening a document, wherever a document is drawn.
 *
 * A document the API is holding is downloaded first. Neither route out of here
 * takes an `https` URL: `Sharing.shareAsync` wants a file this device holds, and
 * an Android intent for a remote URL lands in a browser rather than in a reader.
 * `ensureCachedFile` answers immediately for a document already cached and for
 * one still local to an outgoing bubble, so the download is paid for once per
 * file and never for one this device produced.
 *
 * The download is the part that can take a moment, so the caller says it is
 * working and a second tap is refused while it is — a person tapping twice on a
 * slow connection should not start two of these.
 *
 * A hook rather than a copied `onPress` because the thread bubble and the media
 * gallery open the same file the same way, and "the same way it would from the
 * thread" is a promise that only holds if there is one implementation of it.
 */
export function useOpenDocument(attachment: AttachmentView): OpenDocument {
  const [opening, setOpening] = useState(false)
  const { uri, name } = attachment

  const open = useCallback(async () => {
    if (opening) return
    setOpening(true)
    try {
      const cached = await ensureCachedFile(uri, name)
      if (!cached.ok) {
        Alert.alert(
          'Could not download file',
          'The file could not be fetched. Check your connection and try again.',
        )
        return
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(cached.uri)
        return
      }
      const can = await Linking.canOpenURL(cached.uri)
      if (can) {
        await Linking.openURL(cached.uri)
        return
      }
      Alert.alert('Cannot open file', 'No app is available to open this document.')
    } catch {
      Alert.alert('Cannot open file', 'Something went wrong opening this document.')
    } finally {
      setOpening(false)
    }
  }, [name, opening, uri])

  return { open: () => void open(), opening }
}
