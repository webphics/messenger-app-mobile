import { LinearGradient } from 'expo-linear-gradient'
import { ShieldCheck, Zap } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'
import type { Offer, OfferVisual } from '@/lib/types'

/** Locked mock: payouts blue, zero-fee gold, verify green. Peek next card. */
const GRADIENTS: Record<OfferVisual, readonly [string, string]> = {
  payouts: ['#3452D9', '#1B2F8A'],
  'zero-fee': ['#C9A227', '#6B4A12'],
  verify: ['#1F8A5A', '#0F3D2A'],
}

export function offerCardMetrics(screenWidth: number) {
  const cardWidth = Math.round((screenWidth - 32) * 0.78)
  const gap = 12
  return { cardWidth, gap, snap: cardWidth + gap }
}

type OfferCardProps = {
  offer: Offer
  cardWidth: number
  onPress: () => void
}

function OfferMark({ visual }: { visual: OfferVisual }) {
  if (visual === 'payouts') {
    return (
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-white/20">
        <Zap color={colors.primaryForeground} fill={colors.primaryForeground} size={26} />
      </View>
    )
  }
  if (visual === 'zero-fee') {
    return <Text className="mb-2 font-sans text-5xl font-bold text-white">0%</Text>
  }
  return (
    <View className="mb-4 size-12 items-center justify-center rounded-full bg-white/20">
      <ShieldCheck color={colors.primaryForeground} size={26} />
    </View>
  )
}

export function OfferCard({ offer, cardWidth, onPress }: OfferCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={offer.ctaLabel}
      onPress={onPress}
      style={{ width: cardWidth }}
    >
      <LinearGradient
        colors={[...GRADIENTS[offer.visual]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ minHeight: 196, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 20, paddingVertical: 20 }}
      >
        <OfferMark visual={offer.visual} />
        <Text className="font-sans text-xl font-bold text-white">{offer.title}</Text>
        <Text className="mt-1.5 font-sans text-sm leading-5 text-white/90">{offer.subtitle}</Text>
        <View className="mt-5 self-start rounded-full bg-white px-5 py-2.5">
          <Text className="font-sans text-sm font-semibold text-primary">{offer.ctaLabel}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  )
}
