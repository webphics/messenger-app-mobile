import { LinearGradient } from 'expo-linear-gradient'
import { Image, type ImageSourcePropType, Pressable, View } from 'react-native'
import Animated, { FadeInRight } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import type { Offer, OfferVisual } from '@/lib/types'

const OFFER_IMAGES: Record<OfferVisual, ImageSourcePropType> = {
  payouts: require('../../assets/offers/payouts.png'),
  'zero-fee': require('../../assets/offers/zero-fee.png'),
  verify: require('../../assets/offers/verify.png'),
}

export function offerCardMetrics(screenWidth: number) {
  const cardWidth = Math.round(screenWidth * 0.78)
  const gap = 12
  return { cardWidth, gap, snap: cardWidth + gap }
}

type OfferCardProps = {
  offer: Offer
  cardWidth: number
  index: number
  onPress: () => void
}

export function OfferCard({ offer, cardWidth, index, onPress }: OfferCardProps) {
  return (
    <Animated.View entering={FadeInRight.springify().damping(18).stiffness(180).delay(index * 80)} style={{ width: cardWidth }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={offer.ctaLabel}
        onPress={onPress}
        className="overflow-hidden rounded-2xl shadow-md shadow-black/20"
        style={{ width: cardWidth }}
      >
        <View style={{ minHeight: 196 }}>
          <Image
            source={OFFER_IMAGES[offer.visual]}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            className="absolute inset-0 size-full"
          />
          <LinearGradient
            colors={['rgba(15,17,23,0.15)', 'rgba(15,17,23,0.78)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ minHeight: 196, justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 20 }}
          >
            <Text className="font-sans text-xl font-bold text-white">{offer.title}</Text>
            <Text className="mt-1.5 font-sans text-sm leading-5 text-white/90">{offer.subtitle}</Text>
            <View className="mt-5 self-start rounded-full bg-white px-5 py-2.5">
              <Text className="font-sans text-sm font-semibold text-primary">{offer.ctaLabel}</Text>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  )
}
