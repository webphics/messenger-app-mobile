import { MessageSquare, UserPlus, Users, X } from "@/components/icons";
import { useCallback, useState } from "react";
import { Modal, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ContactList } from "@/components/inbox/contact-list";
import { NewGroupSheet } from "@/components/inbox/new-group-sheet";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { getSessionUser } from "@/lib/session";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import { useContactDirectory } from "@/lib/use-contact-directory";

/**
 * Starting a conversation.
 *
 * The list is `GET /conversations/contacts`, which answers for all three roles
 * — so this one sheet is a Customer's companies, an Agent's Customers and
 * colleagues, and an Admin's whole directory, rather than three screens that
 * would each have to know the rule the API already knows. What a tap does is
 * `lib/contact-directory`'s answer and `lib/use-contact-directory` carries it
 * out: a thread that exists is opened, one that does not is created by the
 * get-or-create behind it, and the row the API hands back joins the shared
 * list directly — refetching the whole inbox to learn about a conversation
 * just handed over would put the largest request in the app between the tap
 * and the thread.
 *
 * A group is the one thing here that is not a person, so it is the one control
 * above the list rather than a row in it. Admin only: `POST /conversations/groups`
 * is `@Roles(['admin'])` and answers an Agent `403` whatever they send.
 */

type NewChatModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Where the thread that came of the tap should be opened. */
  onOpenConversation: (conversationId: string) => void;
};

export function NewChatModal({
  visible,
  onClose,
  onOpenConversation,
}: NewChatModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/*
        A Modal is its own window, so MainActivity's padding of
        android.R.id.content never reaches it and the inherited insets are the
        main window's (zeroed there, since MainActivity consumes them). Its own
        provider reads this window's unconsumed insets, so the sheet locks to
        the safe area like every other screen.
      */}
      <SafeAreaProvider>
        <NewChatSheet onClose={onClose} onOpenConversation={onOpenConversation} />
      </SafeAreaProvider>
    </Modal>
  );
}

function NewChatSheet({
  onClose,
  onOpenConversation,
}: Omit<NewChatModalProps, "visible">) {
  const insets = useSafeAreaInsets();
  const user = getSessionUser();
  const [groupOpen, setGroupOpen] = useState(false);

  const open = useCallback(
    (conversationId: string) => {
      onClose();
      onOpenConversation(conversationId);
    },
    [onClose, onOpenConversation],
  );

  const view = useContactDirectory(user?.role ?? null, open);
  const isCustomer = user?.role === "customer";
  const canCreateGroup = user?.role === "admin";

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <MessageSquare color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            New Message
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

      {canCreateGroup ? (
        <View className="border-b border-line/40 bg-surface px-4 py-3">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="New group"
            onPress={() => setGroupOpen(true)}
            className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-primary/25 bg-primary-soft/60 px-3.5"
          >
            <View className="size-9 items-center justify-center rounded-full bg-surface">
              <Users color={colors.primary} size={18} />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="title" className="text-ink">
                New group
              </Text>
              <Text variant="label" className="font-normal text-muted">
                Several people in one thread
              </Text>
            </View>
            <UserPlus color={colors.primary} size={18} />
          </TactilePressable>
        </View>
      ) : null}

      <ContactList
        view={view}
        searchPlaceholder={
          isCustomer ? "Search companies…" : "Search people by name or role…"
        }
        contentStyle={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      />

      {canCreateGroup ? (
        <NewGroupSheet
          visible={groupOpen}
          onClose={() => setGroupOpen(false)}
          onCreated={open}
        />
      ) : null}
    </View>
  );
}
