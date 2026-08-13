import { useNavigation } from 'expo-router'
import { useLayoutEffect, useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Composer } from '@/components/chat/composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { Text } from '@/components/ui/text'
import { formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'
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
  const insets = useSafeAreaInsets()
  const me = getDevUser()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const isGroup = conversation.kind === 'group' || conversation.id === 'offers'
  const rows = useMemo(() => buildRows(messages, isGroup), [messages, isGroup])

  useLayoutEffect(() => {
    navigation.setOptions({
      ...stackChrome,
      headerShown: true,
      headerTitle: () => <ThreadHeader conversation={conversation} />,
      title: '',
    })
  }, [navigation, conversation])

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
    }
    setDraft('')
    setMessages((prev) => [...prev, base])
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'sent' } : m)))
  }

  const list = (
    <>
      <FlatList
        inverted
        className="flex-1"
        contentContainerClassName="px-4 py-3"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.type === 'day') {
            return (
              <View className="my-3 items-center">
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
            />
          )
        }}
      />
      <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <Composer value={draft} onChangeText={setDraft} onSend={send} />
      </View>
    </>
  )

  if (Platform.OS === 'android') {
    return <View className="flex-1 bg-bg">{list}</View>
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior="padding" keyboardVerticalOffset={88}>
      {list}
    </KeyboardAvoidingView>
  )
}
