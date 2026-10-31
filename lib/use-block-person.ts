import { useCallback } from 'react'
import { Alert } from 'react-native'

import { refusalSentence } from '@/lib/api-result'
import { useBlocks } from '@/lib/blocks-context'
import { confirmBlock } from '@/lib/confirm-block'
import { hapticSuccess } from '@/lib/haptics'

/**
 * Block somebody from a Post or a Message: ask, block, and say so if it failed.
 *
 * What the screen underneath does about it is not this hook's: the Wall and an
 * open thread both read `useBlockedIds`, so the moment the block lands their
 * Posts and Messages leave every list that is drawn. Resolves true once blocked.
 */
export function useBlockPerson(): (person: { id: string; name: string }) => Promise<boolean> {
  const { block } = useBlocks()

  return useCallback(
    async (person: { id: string; name: string }) => {
      if (!(await confirmBlock(person.name))) return false
      const result = await block(person.id)
      if (result.ok) {
        hapticSuccess()
        return true
      }
      const sentence = refusalSentence(result.failure, 'That could not be saved.')
      if (sentence) Alert.alert(`Could not block ${person.name}`, sentence)
      return false
    },
    [block],
  )
}
