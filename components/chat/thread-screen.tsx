import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";

import { Composer } from "@/components/chat/composer";
import {
  MessageActions,
  type ReactionAnchor,
} from "@/components/chat/message-actions";
import {
  MessageBubble,
  type OpenMenuPayload,
  type QuotedMessage,
} from "@/components/chat/message-bubble";
import { ThreadHeader } from "@/components/chat/thread-header";
import { InScreenHeader } from "@/components/in-screen-header";
import { Text } from "@/components/ui/text";
import { formatDayLabel, shouldShowDayDivider } from "@/lib/message-day";
import { quotePreview, toggleReaction } from "@/lib/message-react";
import { DEV_USER_ID, PEOPLE, getDevUser } from "@/lib/mock-data";
import { overlayFrame, overlayFrameFromPoint } from "@/lib/overlay-frame";
import type { Conversation, Message } from "@/lib/types";

type ThreadScreenProps = {
  conversation: Conversation;
  initialMessages: Message[];
};

type Row =
  | { type: "day"; id: string; label: string }
  | { type: "message"; id: string; message: Message; senderName?: string };

function personName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.displayName ?? "Unknown";
}

function quotedOf(
  messages: Message[],
  replyToId?: string,
): QuotedMessage | undefined {
  if (!replyToId) return undefined;
  const quoted = messages.find((m) => m.id === replyToId);
  if (!quoted) return undefined;
  return {
    name: personName(quoted.senderId),
    body: quotePreview(quoted.body),
    isMe: quoted.senderId === DEV_USER_ID,
  };
}

function buildRows(messages: Message[], isGroup: boolean): Row[] {
  const chronological = [...messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const rows: Row[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const message = chronological[i]!;
    const previous = chronological[i - 1];
    if (shouldShowDayDivider(message.createdAt, previous?.createdAt)) {
      rows.push({
        type: "day",
        id: `day-${message.id}`,
        label: formatDayLabel(message.createdAt),
      });
    }
    const outgoing = message.senderId === DEV_USER_ID;
    const sender = PEOPLE.find((p) => p.id === message.senderId);
    rows.push({
      type: "message",
      id: message.id,
      message,
      senderName: isGroup && !outgoing ? sender?.displayName : undefined,
    });
  }
  return rows.reverse();
}

export function ThreadScreen({
  conversation,
  initialMessages,
}: ThreadScreenProps) {
  const me = getDevUser();
  const hostRef = useRef<View>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menu, setMenu] = useState<ReactionAnchor | null>(null);
  const isGroup = conversation.kind === "group" || conversation.id === "offers";
  const rows = useMemo(() => buildRows(messages, isGroup), [messages, isGroup]);
  const replyQuote = replyTo
    ? { name: personName(replyTo.senderId), body: quotePreview(replyTo.body) }
    : null;
  const menuOpen = menu !== null;

  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenu(null);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen]);

  function dismissMenu() {
    setMenu(null);
  }

  function openMenu(payload: OpenMenuPayload) {
    const host = hostRef.current;
    if (!host) return;
    host.measureInWindow((hx, hy, hw, hh) => {
      const hostFrame = { x: hx, y: hy, width: hw, height: hh };
      const rect =
        payload.width > 0 && payload.height > 0
          ? overlayFrame(
              {
                x: payload.pageX,
                y: payload.pageY,
                width: payload.width,
                height: payload.height,
              },
              hostFrame,
            )
          : overlayFrameFromPoint(
              payload.pageX,
              payload.pageY,
              { width: 120, height: 40 },
              hostFrame,
            );
      setMenu({
        messageId: payload.messageId,
        outgoing: payload.outgoing,
        ...rect,
        hostWidth: hw,
      });
    });
  }

  function react(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, reactions: toggleReaction(m.reactions, emoji, me.id) }
          : m,
      ),
    );
    setMenu(null);
  }

  function startReply(message: Message) {
    setReplyTo(message);
    setMenu(null);
  }

  function send() {
    const body = draft.trim();
    if (!body) return;
    const id = `local-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const base: Message = {
      id,
      conversationId: conversation.id,
      senderId: me.id,
      body,
      createdAt,
      status: "sending",
      replyToId: replyTo?.id,
    };
    setDraft("");
    setReplyTo(null);
    setMessages((prev) => [...prev, base]);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "sent" } : m)),
    );
  }

  const host = (
    <View ref={hostRef} collapsable={false} className="flex-1">
      <FlatList
        inverted
        className="flex-1"
        scrollEnabled={!menuOpen}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 py-2"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        CellRendererComponent={({ children, style, ...rest }) => (
          <View
            {...rest}
            collapsable={false}
            style={[style, { overflow: "visible" }]}
          >
            {children}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === "day") {
            return (
              <View className="my-2 items-center">
                <Text className="font-sans text-xs font-medium text-muted">
                  {item.label}
                </Text>
              </View>
            );
          }
          return (
            <MessageBubble
              messageId={item.message.id}
              body={item.message.body}
              outgoing={item.message.senderId === DEV_USER_ID}
              status={item.message.status}
              senderName={item.senderName}
              quoted={quotedOf(messages, item.message.replyToId)}
              reactions={item.message.reactions}
              currentUserId={me.id}
              selected={menu?.messageId === item.message.id}
              enter={item.message.id.startsWith("local-")}
              onOpenMenu={openMenu}
              onReply={() => startReply(item.message)}
              onToggleReaction={(emoji) => react(item.message.id, emoji)}
            />
          );
        }}
      />
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={send}
        replyTo={replyQuote}
        onCancelReply={() => setReplyTo(null)}
      />
      {menu ? (
        <MessageActions
          anchor={menu}
          onDismiss={dismissMenu}
          onReact={(emoji) => react(menu.messageId, emoji)}
          onReply={() => {
            const target = messages.find((m) => m.id === menu.messageId);
            if (target) startReply(target);
          }}
        />
      ) : null}
    </View>
  );

  const header = (
    <InScreenHeader>
      <ThreadHeader conversation={conversation} />
    </InScreenHeader>
  );

  if (Platform.OS === "android") {
    return (
      <View className="flex-1 bg-bg">
        {header}
        {host}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      {header}
      <KeyboardAvoidingView
        className="flex-1"
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {host}
      </KeyboardAvoidingView>
    </View>
  );
}
