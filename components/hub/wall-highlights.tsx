import { router } from "expo-router";
import { ChevronRight } from "@/components/icons";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import { CarouselPagination } from "@/components/hub/carousel-pagination";
import { WallHighlightCard } from "@/components/hub/wall-highlight-card";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { CUSTOMER_HREF } from "@/lib/hub-routes";
import { CARD_MIN_HEIGHT, offerCardMetrics } from "@/lib/offer-metrics";
import { colors } from "@/lib/tokens";
import { useWallHighlights } from "@/lib/use-wall-highlights";
import { wallPostHref } from "@/lib/wall-route";

/**
 * The newest Posts on the Wall, on the Customer Hub.
 *
 * The Featured Offers carousel reading the Wall instead of an in-memory
 * catalogue — same strip, same metrics, same pagination. What went with the
 * source is what sat around it: no Sponsored chip, since these are not paid
 * placements, and no *Join Offers Group Chat* button, since the Wall is a tab
 * directly beneath this rather than a conversation to be let into.
 *
 * A tap on a card opens that Post (`/wall/post/:id`); See all opens the tab. A
 * card had to settle for the tab until the Post had a screen of its own, which
 * meant tapping one landed somebody on a list and left them to find it again.
 *
 * Nothing at all when there is nothing to show, the way the Recent message card
 * above it is simply absent with no thread — a heading over a blank strip reads
 * as a section that failed. Loading is the one case that draws without content.
 */

/** A card-shaped placeholder, so the Hub holds its height while the Wall is read. */
function LoadingCard({ cardWidth }: { cardWidth: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-3xl border border-line/70 bg-surface"
      style={{ width: cardWidth, minHeight: CARD_MIN_HEIGHT }}
    >
      <View className="flex-1 bg-muted/10" />
      <View className="gap-2 p-5">
        <View className="h-3.5 w-3/5 rounded-full bg-muted/15" />
        <View className="h-3 w-2/5 rounded-full bg-muted/10" />
      </View>
    </View>
  );
}

export function WallHighlights() {
  const { width } = useWindowDimensions();
  const highlights = useWallHighlights();
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
  });

  function openWall() {
    router.navigate(CUSTOMER_HREF.wall);
  }

  const posts = highlights.status === "ready" ? highlights.posts : [];
  if (highlights.status === "unavailable") return null;
  if (highlights.status === "ready" && posts.length === 0) return null;

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-4">
        <Text variant="title" className="min-w-0 flex-1 text-ink">
          Latest on the Wall
        </Text>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="See all posts"
          onPress={openWall}
          className="min-h-9 flex-row items-center gap-0.5 justify-center pl-2"
        >
          <Text variant="meta" className="font-semibold text-primary">
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
        className="overflow-visible"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 14,
          paddingStart: edgePad,
          paddingEnd: edgePad,
          gap,
        }}
      >
        {highlights.status === "loading" ? (
          <>
            <LoadingCard cardWidth={cardWidth} />
            <LoadingCard cardWidth={cardWidth} />
          </>
        ) : (
          posts.map((post) => (
            <WallHighlightCard
              key={post.id}
              post={post}
              cardWidth={cardWidth}
              onPress={() => router.push(wallPostHref(post.id))}
            />
          ))
        )}
      </Animated.ScrollView>

      <CarouselPagination count={posts.length} scrollX={scrollX} snap={snap} />
    </View>
  );
}
