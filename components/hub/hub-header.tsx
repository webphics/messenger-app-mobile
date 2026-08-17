import { router, type Href } from "expo-router";
import { Settings } from "@/components/icons";
import { Image, View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { initials } from "@/lib/display";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";

type HubHeaderProps = {
  title?: string;
  settingsHref: Href;
};

export function HubHeader({ settingsHref }: HubHeaderProps) {
  const agents = PEOPLE.filter((p) => p.role === "agent");

  return (
    <View className="flex-row items-center justify-between">
      {/* Brand Logo & Name */}
      <View className="flex-row items-center gap-2.5">
        <Image
          source={require("../../assets/images/icon.png")}
          accessibilityLabel="Messenger Logo"
          className="size-9 rounded-xl shadow-sm shadow-black/10"
          resizeMode="cover"
        />
        <Text className="font-sans text-xl font-extrabold tracking-tight text-ink">
          Messenger
        </Text>
      </View>

      {/* Right Actions: Agents online stack & Settings */}
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          {agents.map((agent, i) => (
            <Avatar
              key={agent.id}
              alt={agent.displayName}
              className="size-9 border-2 border-bg shadow-sm shadow-black/10"
              style={{ marginLeft: i === 0 ? 0 : -10 }}
            >
              <AvatarFallback className="bg-primary-soft">
                <Text className="font-sans text-xs font-bold text-primary">
                  {initials(agent.displayName)}
                </Text>
              </AvatarFallback>
            </Avatar>
          ))}
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push(settingsHref)}
          className="size-11 items-center justify-center rounded-full bg-surface border border-line/60 shadow-sm shadow-black/5"
        >
          <Settings color={colors.ink} size={20} />
        </TactilePressable>
      </View>
    </View>
  );
}
