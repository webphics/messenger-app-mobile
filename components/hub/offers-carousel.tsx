import { router, useFocusEffect } from "expo-router";
import { ChevronRight, MessageCircle } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import { CarouselPagination } from "@/components/hub/carousel-pagination";
import { OfferCard } from "@/components/hub/offer-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { listOffers } from "@/lib/mock-catalog";
import { offerCardMetrics } from "@/lib/offer-metrics";
import { colors } from "@/lib/tokens";
import type { Offer } from "@/lib/types";

export function OffersCarousel() {
  const { width } = useWindowDimensions();
  const [offers, setOffers] = useState<Offer[]>(listOffers);
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  useFocusEffect(
    useCallback(() => {
      setOffers(listOffers());
    }, []),
  );

  function openOffers() {
    router.push(chatHref("offers"));
  }

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-4">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-sans text-base font-bold text-ink">
            Featured Offers
          </Text>
          <View className="rounded-md bg-line/80 px-2 py-0.5">
            <Text className="font-sans text-[10px] font-bold uppercase tracking-wider text-muted">
              Sponsored
            </Text>
          </View>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="See all offers"
          onPress={openOffers}
          className="min-h-9 flex-row items-center gap-0.5 justify-center pl-2"
        >
          <Text className="font-sans text-sm font-semibold text-primary">
            See all
          </Text>
          <ChevronRight color={colors.primary} size={16} />
        </TactilePressable>
      </View>

      <Animated.ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          marginTop: 12,
          paddingStart: edgePad,
          paddingEnd: edgePad,
          gap,
        }}
      >
        {offers.map((offer, i) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            cardWidth={cardWidth}
            index={i}
            onPress={openOffers}
          />
        ))}
      </Animated.ScrollView>

      <CarouselPagination
        count={offers.length}
        scrollX={scrollX}
        snap={snap}
      />

      <View className="px-4">
        <TactilePressable
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel="Join Offers chat"
          onPress={openOffers}
          className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-4 shadow-md shadow-black/10"
        >
          <MessageCircle color={colors.primaryForeground} size={18} />
          <Text className="font-sans font-semibold text-primary-foreground">
            Join Offers Group Chat
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
