import { LinearGradient } from "expo-linear-gradient";
import { Image, type ImageSourcePropType, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { CARD_MIN_HEIGHT } from "@/lib/offer-metrics";
import type { Offer, OfferVisual } from "@/lib/types";

const OFFER_IMAGES: Record<OfferVisual, ImageSourcePropType> = {
  payouts: require("../../assets/offers/payouts.png"),
  "zero-fee": require("../../assets/offers/zero-fee.png"),
  verify: require("../../assets/offers/verify.png"),
};

type OfferCardProps = {
  offer: Offer;
  cardWidth: number;
  index: number;
  onPress: () => void;
};

export function OfferCard({ offer, cardWidth, index, onPress }: OfferCardProps) {
  return (
    <Animated.View
      entering={FadeInRight.springify().damping(18).stiffness(180).delay(index * 80)}
      style={{ width: cardWidth }}
    >
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={offer.ctaLabel}
        onPress={onPress}
        className="overflow-hidden rounded-3xl shadow-lg shadow-black/20"
        style={{ width: cardWidth }}
      >
        <View style={{ minHeight: CARD_MIN_HEIGHT }}>
          <Image
            source={OFFER_IMAGES[offer.visual]}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            className="absolute inset-0 size-full"
          />
          <LinearGradient
            colors={["rgba(15,17,23,0.12)", "rgba(15,17,23,0.85)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              minHeight: CARD_MIN_HEIGHT,
              justifyContent: "flex-end",
              paddingHorizontal: 20,
              paddingVertical: 20,
            }}
          >
            <Text className="font-sans text-xl font-extrabold text-white">
              {offer.title}
            </Text>
            <Text className="mt-1.5 font-sans text-sm font-normal leading-5 text-white/90">
              {offer.subtitle}
            </Text>
            <View className="mt-4 self-start rounded-full bg-white px-5 py-2.5 shadow-sm shadow-black/20">
              <Text className="font-sans text-xs font-bold uppercase tracking-wide text-primary">
                {offer.ctaLabel}
              </Text>
            </View>
          </LinearGradient>
        </View>
      </TactilePressable>
    </Animated.View>
  );
}
