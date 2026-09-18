import { router, type Href } from "expo-router";
import { Settings } from "@/components/icons";
import { Image, View } from "react-native";

// import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // hidden with the agent stack
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
// import { initials } from "@/lib/display"; // hidden with the agent stack
// import { getSession } from "@/lib/session"; // hidden with the agent stack
// import { PEOPLE } from "@/lib/mock-data"; // hidden with the agent stack
import { colors } from "@/lib/tokens";

type HubHeaderProps = {
  settingsHref: Href;
};

export function HubHeader({ settingsHref }: HubHeaderProps) {
  // Hidden with the agent stack below — it read `PEOPLE` from `lib/mock-data`.
  // const showAgentStack = getSession().role !== "customer";
  // const agents = showAgentStack
  //   ? PEOPLE.filter((p) => p.role === "agent")
  //   : [];

  return (
    <View className="flex-row items-center justify-between">
      {/* Brand Logo & Name */}
      <View className="flex-row items-center gap-2">
        <Image
          source={require("../../assets/images/logo.png")}
          accessibilityLabel="JoyChat Logo"
          className="h-8 w-12"
          resizeMode="contain"
        />
        <Text variant="headline" className="text-ink">
          JoyChat
        </Text>
      </View>

      {/* Right Actions: Settings */}
      <View className="flex-row items-center gap-3">
        {/* The "agents online" avatar stack is hidden for now. It was drawn from
            `PEOPLE` in `lib/mock-data` rather than from anything the API knows,
            so it showed three invented names and claimed a presence feature this
            app does not have. Restore by uncommenting. */}
        {/* {agents.length > 0 ? (
          <View className="flex-row">
            {agents.map((agent, i) => (
              <Avatar
                key={agent.id}
                alt={agent.displayName}
                className="size-9 border-2 border-bg shadow-sm shadow-black/10"
                style={{ marginLeft: i === 0 ? 0 : -10 }}
              >
                <AvatarFallback className="bg-primary-soft">
                  <Text variant="label" className="text-primary">
                    {initials(agent.displayName)}
                  </Text>
                </AvatarFallback>
              </Avatar>
            ))}
          </View>
        ) : null} */}
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
