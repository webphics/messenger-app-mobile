import { router } from 'expo-router'
import { MessageCircle } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'

import { OfferCard, offerCardMetrics } from '@/components/hub/offer-card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { chatHref } from '@/lib/chat-route-id'
import { OFFERS } from '@/lib/mock-data'
import { colors } from '@/lib/tokens'

export function OffersCarousel() {
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const { cardWidth, snap } = offerCardMetrics(width)

  function openOffers() {
    router.push(chatHref('offers'))
  }

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-1">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-sans text-base font-semibold text-ink">Offers you may like</Text>
          <Text className="font-sans text-xs text-muted">Sponsored</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all offers"
          onPress={openOffers}
          className="min-h-11 justify-center pl-2"
        >
          <Text className="font-sans text-sm font-medium text-primary">See all</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="mt-3 gap-3 pr-4"
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / snap)
          setIndex(Math.min(Math.max(next, 0), OFFERS.length - 1))
        }}
      >
        {OFFERS.map((offer) => (
          <OfferCard key={offer.id} offer={offer} cardWidth={cardWidth} onPress={openOffers} />
        ))}
      </ScrollView>

      <View className="mt-3 flex-row justify-center gap-1.5">
        {OFFERS.map((offer, i) => (
          <View
            key={offer.id}
            className={cn('size-2 rounded-full', i === index ? 'bg-primary' : 'bg-line')}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Join Offers chat"
        onPress={openOffers}
        className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4"
      >
        <MessageCircle color={colors.primaryForeground} size={18} />
        <Text className="font-sans font-semibold text-white">Join Offers chat</Text>
      </Pressable>
    </View>
  )
}
