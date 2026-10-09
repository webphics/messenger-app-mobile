import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Building, X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { promoteCannedReply } from "@/lib/canned-reply-api";
import { failureNotice } from "@/lib/conversation-failure";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { CannedReply, OrganizationSummary } from "@/lib/types";

/**
 * An Admin shares somebody's personal saved response with an organization. It
 * is the same response afterwards -- same words, same use count -- now offered
 * to everyone covering that organization, its author included. A tap on an
 * organization shares it at once; the sheet says so before anything is tapped.
 */
type PromoteSavedResponseSheetProps = {
  /** The personal response being shared. Null keeps the sheet closed. */
  reply: CannedReply | null;
  organizations: OrganizationSummary[];
  onClose: () => void;
  onPromoted: (reply: CannedReply) => void;
};

export function PromoteSavedResponseSheet({ reply, ...rest }: PromoteSavedResponseSheetProps) {
  return (
    <Modal
      visible={reply !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={rest.onClose}
    >
      <SafeAreaProvider>
        {reply ? <PromoteBody key={reply.id} reply={reply} {...rest} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}

function PromoteBody({
  reply,
  organizations,
  onClose,
  onPromoted,
}: Omit<PromoteSavedResponseSheetProps, "reply"> & { reply: CannedReply }) {
  const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const share = (organizationId: string) => {
    if (busyId) return;
    setBusyId(organizationId);
    setProblem(null);
    void promoteCannedReply(reply.id, organizationId).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        setProblem(failureNotice(result.failure, "Could not share the response").hint);
        return;
      }
      onPromoted(result.value);
      onClose();
    });
  };

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <Text variant="headline" className="text-ink">
          Share with an organization
        </Text>
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
          gap: 10,
          paddingBottom: screenBottomPad(insets.bottom, 24),
        }}
      >
        <Text variant="meta" className="text-ink-soft">
          “{reply.title}” stops being {reply.owner?.name ?? "its author"}’s personal response and
          becomes the organization’s, keeping its words and use count. Tap an organization to share
          it.
        </Text>
        {organizations.map((organization) => (
          <TactilePressable
            key={organization.id}
            accessibilityRole="button"
            accessibilityLabel={`Share with ${organization.name}`}
            accessibilityState={{ busy: busyId === organization.id, disabled: busyId !== null }}
            disabled={busyId !== null}
            onPress={() => share(organization.id)}
            className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface px-4"
          >
            <Building color={colors.primary} size={18} />
            <Text variant="body" className="flex-1 text-ink" numberOfLines={1}>
              {organization.name}
            </Text>
            {busyId === organization.id ? <ActivityIndicator color={colors.primary} /> : null}
          </TactilePressable>
        ))}
        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
            {problem}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
