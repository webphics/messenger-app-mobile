import { useNavigation } from 'expo-router'
import { useLayoutEffect, useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native'

import { Composer } from '@/components/chat/composer'
import { MessageActions } from '@/components/chat/message-actions'
import { MessageBubble, type QuotedMessage } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { Text } from '@/components/ui/text'
import { formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'
import { quotePreview, toggleReaction } from '@/lib/message-react'
import { DEV_USER_ID, PEOPLE, getDevUser } from '@/lib/mock-data'
import { stackChrome } from '@/lib/tokens'
import type { Conversation, Message } from '@/lib/types'

type ThreadScreenProps = {
  conversation: Conversation
  initialMessages: Message[]
}

type Row =
  | { type: 'day'; id: string; label: string }
  | { type: 'message'; id: string; message: Message; senderName?: string }

function personName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.displayName ?? 'Unknown'
}

function quotedOf(messages: Message[], replyToId?: string): QuotedMessage | undefined {
  if (!replyToId) return undefined
  const quoted = messages.find((m) => m.id === replyToId)
  if (!quoted) return undefined
  return {
    name: personName(quoted.senderId),
    body: quotePreview(quoted.body),
    isMe: quoted.senderId === DEV_USER_ID,
  }
}

function buildRows(messages: Message[], isGroup: boolean): Row[] {
  const chronological = [...messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  )
  const rows: Row[] = []
  for (let i = 0; i < chronological.length; i++) {
    const message = chronological[i]!
    const previous = chronological[i - 1]
    if (shouldShowDayDivider(message.createdAt, previous?.createdAt)) {
      rows.push({
        type: 'day',
        id: `day-${message.id}`,
        label: formatDayLabel(message.createdAt),
      })
    }
    const outgoing = message.senderId === DEV_USER_ID
    const sender = PEOPLE.find((p) => p.id === message.senderId)
    rows.push({
      type: 'message',
      id: message.id,
      message,
      senderName: isGroup && !outgoing ? sender?.displayName : undefined,
    })
  }
  return rows.reverse()
}

export function ThreadScreen({ conversation, initialMessages }: ThreadScreenProps) {
  const navigation = useNavigation()
  const me = getDevUser()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [actionFor, setActionFor] = useState<Message | null>(null)
  const isGroup = conversation.kind === 'group' || conversation.id === 'offers'
  const rows = useMemo(() => buildRows(messages, isGroup), [messages, isGroup])
  const replyQuote = replyTo
    ? { name: personName(replyTo.senderId), body: quotePreview(replyTo.body) }
    : null

  useLayoutEffect(() => {
    navigation.setOptions({
      ...stackChrome,
      headerShown: true,
      headerTitle: () => <ThreadHeader conversation={conversation} />,
      title: '',
    })
  }, [navigation, conversation])

  function react(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, reactions: toggleReaction(m.reactions, emoji, me.id) } : m,
      ),
    )
    setActionFor(null)
  }

  function startReply(message: Message) {
    setReplyTo(message)
    setActionFor(null)
  }

  function send() {
    const body = draft.trim()
    if (!body) return
    const id = `local-${Date.now()}`
    const createdAt = new Date().toISOString()
    const base: Message = {
      id,
      conversationId: conversation.id,
      senderId: me.id,
      body,
      createdAt,
      status: 'sending',
      replyToId: replyTo?.id,
    }
    setDraft('')
    setReplyTo(null)
    setMessages((prev) => [...prev, base])
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'sent' } : m)))
  }

  const list = (
    <>
      <FlatList
        inverted
        className="flex-1"
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 py-2"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setActionFor(null)}
        renderItem={({ item }) => {
          if (item.type === 'day') {
            return (
              <View className="my-2 items-center">
                <Text className="font-sans text-xs text-muted">{item.label}</Text>
              </View>
            )
          }
          return (
            <MessageBubble
              body={item.message.body}
              outgoing={item.message.senderId === DEV_USER_ID}
              status={item.message.status}
              senderName={item.senderName}
              quoted={quotedOf(messages, item.message.replyToId)}
              reactions={item.message.reactions}
              currentUserId={me.id}
              selected={actionFor?.id === item.message.id}
              onLongPress={() => setActionFor(item.message)}
              onReply={() => startReply(item.message)}
              onToggleReaction={(emoji) => react(item.message.id, emoji)}
            />
          )
        }}
      />
      {actionFor ? (
        <MessageActions onReply={() => startReply(actionFor)} />
      ) : (
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          replyTo={replyQuote}
          onCancelReply={() => setReplyTo(null)}
        />
      )}
    </>
  )

  if (Platform.OS === 'android') {
    return <View className="flex-1 bg-bg">{list}</View>
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior="padding" keyboardVerticalOffset={72}>
      {list}
    </KeyboardAvoidingView>
  )
}
