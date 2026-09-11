import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Inbox, Plus, Trash2, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { CustomInboxesView } from "@/lib/use-custom-inboxes";
import type { CustomInbox } from "@/lib/types";

/**
 * Making and unmaking saved inboxes.
 *
 * An inbox is a name and a set of organizations, so the sheet is exactly
 * those two fields plus the list of the ones that already exist. There is no
 * preview of what it would contain: selecting it costs nothing and shows the
 * real thing, which is a better answer than a count.
 *
 * They are private. `GET /inboxes` is per person, so nothing here is shared
 * with the team and nothing warns about affecting anybody else.
 */

type ManageInboxesSheetProps = {
  visible: boolean;
  onClose: () => void;
  view: CustomInboxesView;
};

export function ManageInboxesSheet({ visible, onClose, view }: ManageInboxesSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        <ManageInboxes onClose={onClose} view={view} />
      </SafeAreaProvider>
    </Modal>
  );
}

function ManageInboxes({ onClose, view }: Omit<ManageInboxesSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const submit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setProblem("Give the inbox a name.");
      return;
    }
    if (picked.length === 0) {
      setProblem("Pick at least one organization for it to keep.");
      return;
    }

    setProblem(null);
    void view.create(trimmed, picked).then((ok) => {
      if (!ok) {
        setProblem("That could not be saved. Try again.");
        return;
      }
      setName("");
      setPicked([]);
    });
  }, [name, picked, view]);

  const confirmRemove = useCallback(
    (inbox: CustomInbox) => {
      Alert.alert(
        `Delete “${inbox.name}”?`,
        "Only the saved filter goes. No conversation is affected.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => void view.remove(inbox),
          },
        ],
      );
    },
    [view],
  );

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Inbox color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            Saved inboxes
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
          gap: 16,
          paddingBottom: screenBottomPad(insets.bottom, 24),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {view.inboxes.length > 0 ? (
          <View className="gap-2">
            <Text variant="label" className="uppercase tracking-wide text-muted">
              Yours
            </Text>
            {view.inboxes.map((inbox) => (
              <View
                key={inbox.id}
                className="flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5"
              >
                <View className="min-w-0 flex-1">
                  <Text variant="title" className="text-ink" numberOfLines={1}>
                    {inbox.name}
                  </Text>
                  <Text variant="label" className="mt-0.5 font-normal text-muted">
                    {inbox.organizationIds.length === 1
                      ? "1 organization"
                      : `${inbox.organizationIds.length} organizations`}
                  </Text>
                </View>
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${inbox.name}`}
                  onPress={() => confirmRemove(inbox)}
                  className="size-10 items-center justify-center rounded-full"
                >
                  <Trash2 color={colors.danger} size={16} />
                </TactilePressable>
              </View>
            ))}
          </View>
        ) : null}

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            New inbox
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Name it…"
            accessibilityLabel="Inbox name"
            maxLength={80}
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />

          {view.organizations.length === 0 ? (
            <Text variant="meta" className="text-muted">
              You are not in any organization yet, so there is nothing to filter
              by.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {view.organizations.map((organization) => {
                const selected = picked.includes(organization.id);
                return (
                  <TactilePressable
                    key={organization.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={organization.name}
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggle(organization.id)}
                    className={cn(
                      "min-h-11 justify-center rounded-full border px-3.5",
                      selected
                        ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                        : "border-line/80 bg-line/35",
                    )}
                  >
                    <Text
                      variant="label"
                      className={selected ? "text-primary-foreground" : "text-ink-soft"}
                    >
                      {organization.name}
                    </Text>
                  </TactilePressable>
                );
              })}
            </View>
          )}

          {problem ? (
            <Text
              accessibilityLiveRegion="polite"
              variant="label"
              className="text-danger"
            >
              {problem}
            </Text>
          ) : null}

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Save inbox"
            accessibilityState={{ busy: view.busy }}
            disabled={view.busy || view.organizations.length === 0}
            onPress={submit}
            className={cn(
              "min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
              (view.busy || view.organizations.length === 0) && "opacity-60",
            )}
          >
            {view.busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Plus color={colors.primaryForeground} size={18} />
            )}
            <Text variant="label" className="font-semibold text-primary-foreground">
              Save inbox
            </Text>
          </TactilePressable>
        </View>
      </ScrollView>
    </View>
  );
}
