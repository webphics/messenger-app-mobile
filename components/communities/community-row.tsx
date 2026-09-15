import { memo, useCallback } from "react";
import { View } from "react-native";

import { ChevronDown, ChevronRight } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import type { Community } from "@/lib/types";

type CommunityRowProps = {
  community: Community;
  expanded: boolean;
  onToggle: (communityId: string) => void;
};

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A Community, as the header of what it holds.
 *
 * It expands rather than navigates — WhatsApp's shape, and the web client's.
 * What a Community is *for* is the rooms inside it, and a row that opened a
 * screen would put one tap between somebody and every conversation they have in
 * it. The way to the Community screen is `View all`, at the end of what this
 * opens.
 *
 * The chevron is the affordance and the accessible state is the truth: a screen
 * reader is told this is expanded, which no rotation can say.
 */
export const CommunityRow = memo(function CommunityRow({
  community,
  expanded,
  onToggle,
}: CommunityRowProps) {
  const handlePress = useCallback(() => {
    onToggle(community.id);
  }, [community.id, onToggle]);

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={community.name}
      accessibilityHint={
        expanded ? "Hides the groups in this community" : "Shows the groups in this community"
      }
      accessibilityState={{ expanded }}
      onPress={handlePress}
      className="mt-3 flex-row items-center gap-3.5 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
    >
      {/*
        Initials rather than the avatar the API carries, exactly as a
        conversation row does: `avatarUrl` is an object key rather than a URL a
        device can fetch, and resolving one is the storage question this ticket
        does not answer. A wrong image is worse than a right letter.
      */}
      <Avatar alt={community.name} className="size-13">
        <AvatarFallback className="bg-primary-soft">
          <Text variant="title" className="font-bold text-primary">
            {initials(community.name)}
          </Text>
        </AvatarFallback>
      </Avatar>

      <View className="min-w-0 flex-1">
        <Text variant="title" className="text-ink" numberOfLines={1}>
          {community.name}
        </Text>
        <Text variant="meta" className="mt-1 text-muted" numberOfLines={1}>
          {plural(community.memberCount, "member", "members")} ·{" "}
          {plural(community.linkedGroupCount, "group", "groups")}
        </Text>
      </View>

      <Chevron color={colors.muted} size={20} />
    </TactilePressable>
  );
});
