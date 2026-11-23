import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Link, X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { createJoinLink } from "@/lib/join-link-api";
import {
  DEFAULT_JOIN_LINK_EXPIRY_HOURS,
  JOIN_LINK_EXPIRY_OPTIONS,
  JOIN_LINK_USAGE_OPTIONS,
  type JoinLink,
  type JoinLinkExpiryHours,
  type JoinLinkUsageMode,
} from "@/lib/join-links";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { OrganizationSummary } from "@/lib/types";

/**
 * Generating a join link: which organizations it grants, whether one person
 * or anybody may use it, and how long it lives — the three things the API asks
 * for, with the same defaults the web dialog starts from.
 *
 * Nothing is sent for the Admin. The sheet hands the created link back and
 * closes; the list then offers the share sheet on it straight away, since a
 * link is made in order to be handed to somebody.
 */

type JoinLinkSheetProps = {
  visible: boolean;
  onClose: () => void;
  organizations: OrganizationSummary[];
  /** Why the organizations could not be read, or null when they could. */
  organizationsProblem: string | null;
  organizationsLoading: boolean;
  onCreated: (link: JoinLink) => void;
};

export function JoinLinkSheet({ visible, onClose, ...rest }: JoinLinkSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewUserSheet. */}
      <SafeAreaProvider>
        <JoinLinkForm onClose={onClose} {...rest} />
      </SafeAreaProvider>
    </Modal>
  );
}

function JoinLinkForm({
  onClose,
  organizations,
  organizationsProblem,
  organizationsLoading,
  onCreated,
}: Omit<JoinLinkSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);
  const [usageMode, setUsageMode] = useState<JoinLinkUsageMode>("single_use");
  const [expiresInHours, setExpiresInHours] = useState<JoinLinkExpiryHours>(
    DEFAULT_JOIN_LINK_EXPIRY_HOURS,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const submit = useCallback(() => {
    if (busy) return;
    if (picked.length === 0) {
      setProblem("Pick at least one organization the link grants.");
      return;
    }

    setBusy(true);
    setProblem(null);
    void createJoinLink({ organizationIds: picked, usageMode, expiresInHours }).then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not create the join link").hint);
          return;
        }
        onCreated(result.value);
      },
    );
  }, [busy, expiresInHours, onCreated, picked, usageMode]);

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Link color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            New join link
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
        contentContainerStyle={{ padding: 16, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="meta" className="text-muted">
          Whoever opens this link while signed in becomes a member of the organizations it
          names. Nothing is sent for you.
        </Text>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Organizations
          </Text>
          {organizationsLoading ? (
            <ActivityIndicator color={colors.primary} className="self-start" />
          ) : organizationsProblem ? (
            <Text variant="meta" className="text-danger">
              {organizationsProblem}
            </Text>
          ) : organizations.length === 0 ? (
            <Text variant="meta" className="text-muted">
              There are no organizations yet. Create one first.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {organizations.map((organization) => {
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
          <Text variant="label" className="font-normal text-muted">
            One link can name several. Opening it joins all of them at once.
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Usage
          </Text>
          {JOIN_LINK_USAGE_OPTIONS.map((option) => {
            const selected = option.mode === usageMode;
            return (
              <TactilePressable
                key={option.mode}
                accessibilityRole="radio"
                accessibilityLabel={`${option.label}. ${option.hint}`}
                accessibilityState={{ selected }}
                onPress={() => setUsageMode(option.mode)}
                className={cn(
                  "min-h-11 rounded-2xl border px-3.5 py-2.5",
                  selected ? "border-primary bg-primary-soft" : "border-line/80 bg-line/35",
                )}
              >
                <Text
                  variant="label"
                  className={cn("font-semibold", selected ? "text-primary" : "text-ink")}
                >
                  {option.label}
                </Text>
                <Text variant="label" className="font-normal text-muted">
                  {option.hint}
                </Text>
              </TactilePressable>
            );
          })}
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Expires in
          </Text>
          <View className="flex-row gap-2">
            {JOIN_LINK_EXPIRY_OPTIONS.map((option) => {
              const selected = option.hours === expiresInHours;
              return (
                <TactilePressable
                  key={option.hours}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => setExpiresInHours(option.hours)}
                  className={cn(
                    "min-h-11 flex-1 justify-center rounded-2xl border px-3",
                    selected
                      ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={cn(
                      "text-center",
                      selected ? "text-primary-foreground" : "text-ink-soft",
                    )}
                  >
                    {option.label}
                  </Text>
                </TactilePressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View
        className="border-t border-line/60 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="meta" className="mb-2 text-danger">
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Create join link"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={submit}
          className={cn(
            "min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
            busy && "opacity-70",
          )}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text variant="label" className="font-semibold text-primary-foreground">
            Create join link
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
