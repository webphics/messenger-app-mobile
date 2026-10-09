import { Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Building, Check, X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { toggleOrganization } from "@/lib/organization-filter";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Organization } from "@/lib/types";

/**
 * The Org pill's list: every organization the viewer can reach, any number of
 * them picked. A tap narrows the inbox underneath at once, so there is nothing
 * to confirm; Done only puts the sheet away.
 */
type OrganizationFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  organizations: readonly Organization[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
};

export function OrganizationFilterSheet({ visible, onClose, ...rest }: OrganizationFilterSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        <OrganizationFilter onClose={onClose} {...rest} />
      </SafeAreaProvider>
    </Modal>
  );
}

function OrganizationFilter({
  onClose,
  organizations,
  selected,
  onChange,
}: Omit<OrganizationFilterSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const anyPicked = selected.length > 0;

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Building color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            Organizations
          </Text>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onClose}
          className="size-9 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={18} />
        </TactilePressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          gap: 8,
          paddingBottom: screenBottomPad(insets.bottom, 24),
        }}
      >
        <Text variant="label" className="mb-1 uppercase tracking-wide text-muted">
          Show conversations from
        </Text>
        {organizations.map((organization) => {
          const checked = selected.includes(organization.id);
          return (
            <TactilePressable
              key={organization.id}
              accessibilityRole="checkbox"
              accessibilityLabel={organization.name}
              accessibilityState={{ checked }}
              onPress={() => onChange(toggleOrganization(selected, organization.id))}
              className={cn(
                "min-h-12 flex-row items-center gap-3 rounded-2xl border px-4",
                checked ? "border-primary/40 bg-primary-soft" : "border-line/70 bg-surface",
              )}
            >
              <Text
                variant="body"
                numberOfLines={1}
                className={cn("flex-1", checked ? "font-semibold text-primary" : "text-ink")}
              >
                {organization.name}
              </Text>
              <View
                className={cn(
                  "size-6 items-center justify-center rounded-full border",
                  checked ? "border-primary bg-primary" : "border-line",
                )}
              >
                {checked ? <Check color={colors.primaryForeground} size={14} /> : null}
              </View>
            </TactilePressable>
          );
        })}

        <View className="mt-3 flex-row gap-2">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Show all organizations"
            accessibilityState={{ disabled: !anyPicked }}
            disabled={!anyPicked}
            onPress={() => onChange([])}
            className={cn(
              "min-h-12 flex-1 items-center justify-center rounded-2xl border border-line/80 bg-surface",
              !anyPicked && "opacity-50",
            )}
          >
            <Text variant="label" className="font-semibold text-ink-soft">
              Show all
            </Text>
          </TactilePressable>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onClose}
            className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary"
          >
            <Text variant="label" className="font-semibold text-primary-foreground">
              Done
            </Text>
          </TactilePressable>
        </View>
      </ScrollView>
    </View>
  );
}
