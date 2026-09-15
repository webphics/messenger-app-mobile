import { memo } from "react";
import { ActivityIndicator, View } from "react-native";

import { plural } from "@/components/communities/community-row";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { canRequestJoin, joinButtonLabel } from "@/lib/community-join";
import { initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import type { CommunityJoinableGroupRow } from "@/lib/types";

type CommunityJoinableRowProps = {
  row: CommunityJoinableGroupRow;
  /** This row's own join request is out — draws the spinner. */
  busy: boolean;
  /** A different row's request is out. Disabled, but silently: no spinner of its own. */
  blocked: boolean;
  onJoin: (row: CommunityJoinableGroupRow) => void;
};

/**
 * A Group in `Groups you can join`: no preview, no time, no unread — a member
 * count instead, because membership is the read boundary and this client was
 * never handed any of that for a room nobody let it into.
 *
 * The button is the one thing this row exists to offer. Its label and whether
 * it does anything are `lib/community-join`'s; this only draws them and a
 * spinner in the button while a tap is in flight.
 */
export const CommunityJoinableRowView = memo(function CommunityJoinableRowView({
  row,
  busy,
  blocked,
  onJoin,
}: CommunityJoinableRowProps) {
  const label = joinButtonLabel(row);
  const pending = row.joinState === "pending";
  const disabled = busy || blocked || !canRequestJoin(row);

  return (
    <View className="mt-1.5 flex-row items-center gap-3 rounded-2xl border border-line/50 bg-surface/80 p-3">
      <Avatar alt={row.title} className="size-11">
        <AvatarFallback className="bg-line">
          <Text variant="label" className="font-bold text-ink-soft">
            {initials(row.title)}
          </Text>
        </AvatarFallback>
      </Avatar>

      <View className="min-w-0 flex-1">
        <Text variant="meta" className="font-medium text-ink" numberOfLines={1}>
          {row.title}
        </Text>
        <Text variant="label" className="mt-0.5 font-normal text-muted" numberOfLines={1}>
          {plural(row.memberCount, "member", "members")}
        </Text>
      </View>

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={pending ? `${row.title}, request pending` : `${label}, ${row.title}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onJoin(row)}
        className={`min-h-11 min-w-24 shrink-0 items-center justify-center rounded-full px-3.5 ${
          pending ? "bg-line/70" : "bg-primary"
        }`}
      >
        {busy ? (
          <ActivityIndicator color={pending ? colors.muted : colors.primaryForeground} size="small" />
        ) : (
          <Text
            variant="label"
            className={`font-bold ${pending ? "text-muted" : "text-primary-foreground"}`}
          >
            {label}
          </Text>
        )}
      </TactilePressable>
    </View>
  );
});
