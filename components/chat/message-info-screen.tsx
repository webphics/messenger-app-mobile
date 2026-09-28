import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { InScreenHeader } from '@/components/in-screen-header'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { avatarInitials } from '@/lib/display'
import { formatReceiptStamp } from '@/lib/message-receipt-format'
import { screenBottomPad } from '@/lib/tokens'
import type { Message, MessageReceipt } from '@/lib/types'
import type { MessageReceiptsState } from '@/lib/use-message-receipts'

type MessageInfoScreenProps = {
  /** Absent where the thread no longer holds the message — see the route. */
  message: Message | null
  state: MessageReceiptsState
  reload: () => void
}

function ReceiptRow({ receipt }: { receipt: MessageReceipt }) {
  return (
    <View className="min-h-11 flex-row items-center gap-3 py-1.5">
      {/* A nameless receipt gets no avatar rather than an avatar of a question
          mark: in a support DM the company answers as one voice, and a face
          would invite the reader to wonder whose it is. */}
      {receipt.user ? (
        <Avatar alt={receipt.user.name} className="size-9">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="meta" className="font-bold text-primary">
              {avatarInitials(receipt.user)}
            </Text>
          </AvatarFallback>
        </Avatar>
      ) : null}
      <Text variant="body" className="flex-1" numberOfLines={1}>
        {receipt.user ? receipt.user.name : 'Support'}
      </Text>
      <Text variant="meta" className="text-muted">
        {formatReceiptStamp(receipt.at)}
      </Text>
    </View>
  )
}

function ReceiptGroup({
  title,
  receipts,
  empty,
}: {
  title: string
  receipts: MessageReceipt[]
  empty: string
}) {
  return (
    <View className="border-b border-line/40 px-4 py-4">
      <Text variant="label" className="mb-2 font-semibold uppercase text-muted">
        {receipts.length > 0 ? `${title} · ${receipts.length}` : title}
      </Text>
      {receipts.length === 0 ? (
        <Text variant="meta" className="text-muted">
          {empty}
        </Text>
      ) : (
        receipts.map((receipt, index) => (
          <ReceiptRow key={receipt.user ? receipt.user.id : `anonymous-${index}`} receipt={receipt} />
        ))
      )}
    </View>
  )
}

/**
 * Who has read one message, and when.
 *
 * A screen of its own rather than something on the bubble, for the reason
 * WhatsApp gives it one: in a group it is a list of people that grows with the
 * membership, and there is nowhere on a bubble to put it. It is reached only
 * from the viewer's own messages, which is the API's rule as well — asking about
 * somebody else's is a 403, so the way in is gated rather than the screen left
 * to fail.
 */
export function MessageInfoScreen({ message, state, reload }: MessageInfoScreenProps) {
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-canvas">
      <InScreenHeader>
        <Text variant="title" className="flex-1">
          Message info
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom) }}
      >
        {message ? (
          <View className="border-b border-line/40 px-4 py-4">
            {/* The message itself, so the screen says what it is about. Clamped
                rather than scrolled: this is a reminder of which bubble was
                picked, not a second copy of the thread. */}
            <View className="rounded-2xl bg-surface px-3 py-2">
              <Text variant="body" numberOfLines={4}>
                {message.body || 'Attachment'}
              </Text>
            </View>
            <Text variant="meta" className="mt-2 text-muted">
              Sent {formatReceiptStamp(message.createdAt)}
            </Text>
          </View>
        ) : null}

        {state.status === 'loading' ? (
          <View className="items-center py-10">
            <ActivityIndicator accessibilityLabel="Loading message info…" />
          </View>
        ) : state.status === 'failed' ? (
          <View className="items-center gap-3 px-4 py-10">
            <Text variant="body" className="text-center text-muted">
              Couldn’t load message info.
            </Text>
            <Button onPress={reload}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : (
          <>
            <ReceiptGroup
              title="Read by"
              receipts={state.receipts.readBy}
              empty="No one has read this yet."
            />
            <ReceiptGroup
              title="Delivered to"
              receipts={state.receipts.deliveredTo}
              empty="Not delivered to anyone else yet."
            />
          </>
        )}
      </ScrollView>
    </View>
  )
}
