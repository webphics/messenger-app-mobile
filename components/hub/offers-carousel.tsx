import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { OfferCard } from "@/components/hub/offer-card";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { OFFERS } from "@/lib/mock-data";
import { offerCardMetrics } from "@/lib/offer-metrics";
import { colors } from "@/lib/tokens";

export function OffersCarousel() {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);

  function openOffers() {
    router.push(chatHref("offers"));
  }

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-4">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-sans text-base font-semibold text-ink">
            Offers you may like
          </Text>
          <Text className="font-sans text-xs font-normal text-muted">Sponsored</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all offers"
          onPress={openOffers}
          className="min-h-11 justify-center pl-2"
        >
          <Text className="font-sans text-sm font-medium text-primary">
            See all
          </Text>
        </Pressable>
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
          setIndex(Math.min(Math.max(next, 0), OFFERS.length - 1));
        }}
      >
        {OFFERS.map((offer, i) => (
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
        {OFFERS.map((offer, i) => (
          <View
            key={offer.id}
            className={cn(
              "size-2 rounded-full",
              i === index ? "bg-primary" : "bg-line",
            )}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Join Offers chat"
        onPress={openOffers}
        className="mx-4 mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 shadow-md shadow-black/15"
      >
        <MessageCircle color={colors.primaryForeground} size={18} />
        <Text className="font-sans font-semibold text-primary-foreground">
          Join Offers chat
        </Text>
      </Pressable>
    </View>
  );
}
