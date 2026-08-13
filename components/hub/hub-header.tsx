import { router, type Href } from "expo-router";
import { Settings } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { initials } from "@/lib/display";
import { PEOPLE } from "@/lib/mock-data";
import { colors } from "@/lib/tokens";

type HubHeaderProps = {
  title: string;
  settingsHref: Href;
};

export function HubHeader({ title, settingsHref }: HubHeaderProps) {
  const agents = PEOPLE.filter((p) => p.role === "agent");

  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-sans text-2xl font-bold uppercase tracking-wide text-ink">
        {title}
      </Text>
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          {agents.map((agent, i) => (
            <Avatar
              key={agent.id}
              alt={agent.displayName}
              className="size-9 border-2 border-bg"
              style={{ marginLeft: i === 0 ? 0 : -10 }}
            >
              <AvatarFallback className="bg-primary-soft">
                <Text className="font-sans text-xs font-semibold text-primary">
                  {initials(agent.displayName)}
                </Text>
              </AvatarFallback>
            </Avatar>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push(settingsHref)}
          className="size-11 items-center justify-center"
        >
          <Settings color={colors.ink} size={22} />
        </Pressable>
      </View>
    </View>
  );
}
