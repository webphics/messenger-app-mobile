import { router, useFocusEffect } from "expo-router";
import { ChevronRight, MessageCircle } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { OfferCard } from "@/components/hub/offer-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { listOffers } from "@/lib/mock-catalog";
import { offerCardMetrics } from "@/lib/offer-metrics";
import { colors } from "@/lib/tokens";
import type { Offer } from "@/lib/types";

export function OffersCarousel() {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [offers, setOffers] = useState<Offer[]>(listOffers);
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);

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

      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          marginTop: 12,
          paddingStart: edgePad,
          paddingEnd: edgePad,
          gap,
        }}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / snap);
          setIndex(Math.min(Math.max(next, 0), offers.length - 1));
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
      </ScrollView>

      <View className="mt-3 flex-row justify-center gap-1.5">
        {offers.map((offer, i) => (
          <View
            key={offer.id}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-6 bg-primary" : "w-1.5 bg-line",
            )}
          />
        ))}
      </View>

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
