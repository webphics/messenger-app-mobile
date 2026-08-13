import { Check, CheckCheck } from 'lucide-react-native'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import type { MessageStatus } from '@/lib/types'

type MessageBubbleProps = {
  body: string
  outgoing: boolean
  status: MessageStatus
  senderName?: string
}

function Ticks({ status, outgoing }: { status: MessageStatus; outgoing: boolean }) {
  if (!outgoing) return null
  if (status === 'sending') {
    return <Text className="mt-1 text-right font-sans text-[10px] text-primary-foreground/80">Sending</Text>
  }
  const color = status === 'read' ? '#FFFFFF' : 'rgba(255,255,255,0.85)'
  const Icon = status === 'sent' ? Check : CheckCheck
  return (
    <View className="mt-1 items-end">
      <Icon color={color} size={12} />
    </View>
  )
}

export function MessageBubble({ body, outgoing, status, senderName }: MessageBubbleProps) {
  return (
    <View className={cn('mb-2 max-w-[78%]', outgoing ? 'self-end' : 'self-start')}>
      {senderName ? (
        <Text className="mb-1 px-1 font-sans text-xs text-muted">{senderName}</Text>
      ) : null}
      <View
        className={cn('px-3.5 py-2.5', outgoing ? 'bg-primary' : 'bg-bubble-in')}
        style={{ borderRadius: 18 }}
      >
        <Text
          className={cn('font-sans text-[15px] leading-5', outgoing ? 'text-primary-foreground' : 'text-ink')}
        >
          {body}
        </Text>
        <Ticks status={status} outgoing={outgoing} />
      </View>
    </View>
  )
}
