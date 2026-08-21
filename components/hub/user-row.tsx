import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Check, ChevronDown, ChevronUp, Copy, Mail, MessageCircle } from "@/components/icons";
import { memo, useCallback, useState } from "react";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { initials } from "@/lib/display";
import { hapticSuccess } from "@/lib/haptics";
import { CONVERSATIONS } from "@/lib/mock-data";
import { listItemEnter, settleEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";
import { mockEmail } from "@/lib/user-filter";
import type { Person } from "@/lib/types";

const ROLE_LABEL = {
  admin: "Admin",
  agent: "Agent",
  contact: "Contact",
} as const;

type UserRowProps = {
  person: Person;
  open: boolean;
  onPress: (personId: string) => void;
  index?: number;
};

export const UserRow = memo(function UserRow({
  person,
  open,
  onPress,
  index = 0,
}: UserRowProps) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const email = mockEmail(person.displayName);

  const handlePress = useCallback(() => {
    onPress(person.id);
  }, [onPress, person.id]);

  async function handleCopyEmail() {
    await Clipboard.setStringAsync(email);
    hapticSuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleMessage() {
    const thread = CONVERSATIONS.find((c) =>
      c.participantIds.includes(person.id),
    );
    if (thread) {
      router.push(`/chat/${thread.id}`);
    } else {
      router.push("/(admin)/conversations");
    }
  }

  return (
    <Animated.View entering={listItemEnter(!!reduceMotion, index)}>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={person.displayName}
        accessibilityState={{ expanded: open }}
        onPress={handlePress}
        className="rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
      >
        <View className="flex-row items-center gap-3.5">
          <View className="relative">
            <Avatar alt={person.displayName} className="size-13">
              <AvatarFallback className="bg-primary-soft">
                <Text variant="title" className="text-primary">
                  {initials(person.displayName)}
                </Text>
              </AvatarFallback>
            </Avatar>
            {person.isOnline ? (
              <PresenceDot className="absolute bottom-0 right-0 size-3.5 border-2 border-surface" />
            ) : null}
          </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="title" className="text-ink" numberOfLines={1}>
              {person.displayName}
            </Text>
            <View
              className={`rounded-md px-2 py-0.5 ${
                person.role === "admin"
                  ? "bg-primary-soft"
                  : person.role === "agent"
                    ? "bg-amber/15"
                    : "bg-line/70"
              }`}
            >
              <Text
                variant="label"
                className={
                  person.role === "admin"
                    ? "font-bold text-primary"
                    : person.role === "agent"
                      ? "font-bold text-amber"
                      : "text-muted"
                }
              >
                {ROLE_LABEL[person.role]}
              </Text>
            </View>
          </View>
          <Text variant="meta" className="mt-0.5 text-muted" numberOfLines={1}>
            {person.isOnline ? "Active now" : `Last seen ${person.lastActiveLabel}`}
          </Text>
        </View>

        {open ? (
          <ChevronUp color={colors.primary} size={20} />
        ) : (
          <ChevronDown color={colors.muted} size={20} />
        )}
      </View>

      {open ? (
        <Animated.View
          entering={settleEnter(!!reduceMotion)}
          className="mt-3.5 border-t border-line/60 pt-3.5"
        >
          <View className="flex-row items-center gap-2">
            <Mail color={colors.muted} size={15} />
            <Text variant="meta" className="flex-1 text-ink-soft" selectable>
              {email}
            </Text>
          </View>

          <View className="mt-3 flex-row gap-2">
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Copy email"
              onPress={handleCopyEmail}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line/80 bg-line/35 py-2.5 shadow-xs shadow-black/5 active:scale-[0.98]"
            >
              {copied ? (
                <Check color={colors.success} size={16} />
              ) : (
                <Copy color={colors.ink} size={16} />
              )}
              <Text variant="label" className="text-ink">
                {copied ? "Copied" : "Copy Email"}
              </Text>
            </TactilePressable>

            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Direct message"
              onPress={handleMessage}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 shadow-sm shadow-primary/25 active:scale-[0.98]"
            >
              <MessageCircle color={colors.primaryForeground} size={16} />
              <Text variant="label" className="text-primary-foreground">
                Message
              </Text>
            </TactilePressable>
          </View>
        </Animated.View>
      ) : null}
    </TactilePressable>
    </Animated.View>
  );
});
