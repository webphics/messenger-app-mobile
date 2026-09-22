import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";

import { Newspaper } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { toWallAttachmentView } from "@/lib/attachment-view";
import { formatRelativeTime } from "@/lib/display";
import { CARD_MIN_HEIGHT } from "@/lib/offer-metrics";
import { colors } from "@/lib/tokens";
import { groupWallAttachments } from "@/lib/wall-card";
import type { WallPost } from "@/lib/types";

/**
 * One Post on the Hub: the image it leads with, what it says over the bottom of
 * it, and its link as the pill.
 *
 * The Offer card, reading a Post — the shape was never about offers. An image
 * under a gradient, a line of text and a pill is what a Post is too: it leads
 * with an image (`CreateWallPostSchema` requires one), it says something, and it
 * may carry one labelled link. So the title becomes the body, the subtitle
 * becomes the byline, and the CTA becomes `post.link.label`.
 *
 * Not `WallPostCard`. That card is the whole Post — every image, the vote pill,
 * reactions, bookmark, reply, overflow. Nothing here acts on a Post: a tap goes
 * to the Wall, which is where all of that lives.
 */

type WallHighlightCardProps = {
  post: WallPost;
  cardWidth: number;
  onPress: () => void;
};

export function WallHighlightCard({
  post,
  cardWidth,
  onPress,
}: WallHighlightCardProps) {
  // The first image, not a collage: a Post leads with one, and the Wall is
  // where the rest of them are. `images` can still be empty — a Post written
  // before the rule may carry none, and an edit is only stopped from removing
  // the last image a Post already had — so the mark below is a real case rather
  // than a defensive branch.
  const { images } = groupWallAttachments(post.attachments);
  const lead = images[0];
  // The headline where the Post has one, its body where it does not. Every kind
  // but `community` carries a title server-side, and a card this size has room
  // for one line — so showing the supporting sentence instead of the headline,
  // which is what this did before titles were read, buried the point.
  const body = post.title?.trim() || post.body?.trim() || "";
  const byline = `${post.author.name} · ${formatRelativeTime(post.createdAt)}`;

  // No entrance: the hub behind this carousel does not animate either, so a
  // card sliding in would be the one thing on the screen claiming to have
  // arrived — on a surface reached from a tab dozens of times a day.
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={body ? `${body}. ${byline}` : `Post by ${byline}`}
      onPress={onPress}
      className="overflow-hidden rounded-3xl shadow-lg shadow-black/20"
      style={{ width: cardWidth }}
    >
      <View style={{ minHeight: CARD_MIN_HEIGHT }}>
        {lead ? (
          <Image
            source={{ uri: toWallAttachmentView(lead).uri }}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            className="absolute inset-0 size-full"
          />
        ) : (
          <View className="absolute inset-0 size-full items-center justify-center bg-primary-soft">
            <Newspaper color={colors.primary} size={28} />
          </View>
        )}
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
          {/* `title`, not `headline`: a Post's body is somebody's sentence and
              runs to three lines here, where an offer's title was two words. */}
          {body ? (
            <Text variant="title" className="text-white" numberOfLines={3}>
              {body}
            </Text>
          ) : null}
          <Text
            variant="meta"
            className={body ? "mt-1.5 text-white/85" : "text-white/85"}
            numberOfLines={1}
          >
            {byline}
          </Text>
          {/* The pill is the Post's own link, so a Post without one gets none —
              it says where the tap goes, and inventing a label for a card that
              only opens the Wall would be putting words in the author's mouth. */}
          {post.link ? (
            <View className="mt-4 self-start rounded-full bg-white px-5 py-2.5 shadow-sm shadow-black/20">
              <Text
                variant="label"
                className="uppercase tracking-wider text-primary"
                numberOfLines={1}
              >
                {post.link.label}
              </Text>
            </View>
          ) : null}
        </LinearGradient>
      </View>
    </TactilePressable>
  );
}
