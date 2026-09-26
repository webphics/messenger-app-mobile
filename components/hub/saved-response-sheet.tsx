import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SquarePen, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { createCannedReply, updateCannedReply } from "@/lib/canned-reply-api";
import {
  CANNED_REPLY_BODY_MAX,
  CANNED_REPLY_TITLE_MAX,
  cannedReplyDraftProblem,
} from "@/lib/canned-reply-library";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { CannedReply, OrganizationSummary } from "@/lib/types";

/**
 * Creating or editing a saved response.
 *
 * The two differ in one field. The organization is chosen once, at creation,
 * and never changes — the API refuses to move a saved response, because text
 * written in one company's voice filed under another's is never the intent —
 * so editing names it instead of offering a picker that would be refused.
 */

type SavedResponseSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The response being edited, or null to create one. */
  reply: CannedReply | null;
  organizations: OrganizationSummary[];
  /** Pre-picked when creating, so a list filtered to one organization adds to it. */
  defaultOrganizationId: string | null;
  /** Handed the saved row, so the list can show it without refetching. */
  onSaved: (reply: CannedReply) => void;
};

export function SavedResponseSheet({ visible, ...props }: SavedResponseSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        {/* Keyed so each opening starts from the row it was opened for. */}
        <SavedResponseForm key={props.reply?.id ?? "new"} {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function SavedResponseForm({
  onClose,
  reply,
  organizations,
  defaultOrganizationId,
  onSaved,
}: Omit<SavedResponseSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const editing = reply !== null;
  const [organizationId, setOrganizationId] = useState<string | null>(
    reply?.organizationId ?? defaultOrganizationId,
  );
  const [title, setTitle] = useState(reply?.title ?? "");
  const [body, setBody] = useState(reply?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const organizationName =
    organizations.find((organization) => organization.id === organizationId)?.name ?? null;

  const submit = useCallback(() => {
    const invalid = cannedReplyDraftProblem({ organizationId, title, body });
    if (invalid) {
      setProblem(invalid);
      return;
    }

    const draft = { title: title.trim(), body: body.trim() };
    setBusy(true);
    setProblem(null);
    const request = reply
      ? updateCannedReply(reply.id, draft)
      : createCannedReply({ organizationId: organizationId as string, ...draft });

    void request.then((result) => {
      setBusy(false);
      if (!result.ok) {
        setProblem(
          failureNotice(
            result.failure,
            reply ? "Could not save the response" : "Could not create the response",
          ).hint,
        );
        return;
      }
      onSaved(result.value);
      onClose();
    });
  }, [body, onClose, onSaved, organizationId, reply, title]);

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <SquarePen color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            {editing ? "Edit saved response" : "New saved response"}
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
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Organization
          </Text>
          {editing ? (
            <Text variant="meta" className="text-ink-soft">
              {organizationName ?? "Its organization"}. A saved response stays with
              the organization it was created in.
            </Text>
          ) : organizations.length === 0 ? (
            <Text variant="meta" className="text-muted">
              There are no organizations yet. Create one first — a saved response
              always belongs to one.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {organizations.map((organization) => {
                const selected = organization.id === organizationId;
                return (
                  <TactilePressable
                    key={organization.id}
                    accessibilityRole="radio"
                    accessibilityLabel={organization.name}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setOrganizationId(organization.id)}
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
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Title
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Refund policy…"
            accessibilityLabel="Title"
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            What agents search for. {title.trim().length}/{CANNED_REPLY_TITLE_MAX}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Response
          </Text>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder="Refunds are available within 30 days of purchase…"
            accessibilityLabel="Response text"
            multiline
            textAlignVertical="top"
            className="h-44 rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            Line breaks are kept as written. {body.trim().length}/{CANNED_REPLY_BODY_MAX}
          </Text>
        </View>
      </ScrollView>

      <View
        className="border-t border-line/60 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        {problem ? (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            className="mb-2 text-danger"
          >
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={editing ? "Save changes" : "Create response"}
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
            {editing ? "Save changes" : "Create response"}
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
