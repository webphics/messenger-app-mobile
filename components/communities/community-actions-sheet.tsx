import { Modal, Pressable, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { LogOut } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * What the Community screen's overflow control opens.
 *
 * One action today: leaving, for a member. Administering a Community — its
 * name, its members, its linked Groups — stays on web, so there is nothing
 * else this sheet could offer and it is never handed a list to decide from
 * the way `WallPostActionsSheet` is; a member is always allowed to leave.
 *
 * Closes and hands the tap up rather than acting here, exactly as the Wall's
 * sheet does: leaving needs a confirmation first, which does not belong
 * inside a sheet about to be dismissed out from under it.
 */
type CommunityActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  onLeave: () => void;
};

export function CommunityActionsSheet({ visible, onClose, onLeave }: CommunityActionsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <Sheet onClose={onClose} onLeave={onLeave} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 justify-end bg-black/40">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        className="rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Leave community"
          onPress={() => {
            onClose();
            onLeave();
          }}
          className="min-h-14 flex-row items-center gap-3 rounded-2xl px-2"
        >
          <View className="size-9 items-center justify-center rounded-xl bg-danger/10">
            <LogOut color={colors.danger} size={18} />
          </View>
          <Text variant="title" className="text-danger">
            Leave community
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
