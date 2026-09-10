import { LinearGradient } from "expo-linear-gradient";
import { Image, type ImageSourcePropType, View } from "react-native";

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
  onPress: () => void;
};

export function OfferCard({ offer, cardWidth, onPress }: OfferCardProps) {
  // No entrance: the hub behind this carousel does not animate either, so a
  // card sliding in would be the one thing on the screen claiming to have
  // arrived — on a surface reached from a tab dozens of times a day.
  return (
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
          <Text variant="headline" className="text-white">
            {offer.title}
          </Text>
          <Text variant="meta" className="mt-1.5 text-white/90">
            {offer.subtitle}
          </Text>
          <View className="mt-4 self-start rounded-full bg-white px-5 py-2.5 shadow-sm shadow-black/20">
            <Text variant="label" className="uppercase tracking-wider text-primary">
              {offer.ctaLabel}
            </Text>
          </View>
        </LinearGradient>
      </View>
    </TactilePressable>
  );
}
