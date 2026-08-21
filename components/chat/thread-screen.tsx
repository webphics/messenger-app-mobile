import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Dimensions, FlatList, View } from "react-native";

import { Composer } from "@/components/chat/composer";
import { MessageActions } from "@/components/chat/message-actions";
import {
  MessageBubble,
  type QuotedMessage,
} from "@/components/chat/message-bubble";
import { ThreadHeader } from "@/components/chat/thread-header";
import { InScreenHeader } from "@/components/in-screen-header";
import { Text } from "@/components/ui/text";
import { useKeyboardInset } from "@/lib/keyboard-inset";
import { formatDayLabel, shouldShowDayDivider } from "@/lib/message-day";
import { quotePreview, toggleReaction } from "@/lib/message-react";
import { getDevUser, getDevUserId } from "@/lib/dev-user";
import { PEOPLE } from "@/lib/mock-data";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import {
  anchorFromPayload,
  type OpenMenuPayload,
  type ReactionAnchor,
} from "@/lib/overlay-frame";
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
    const outgoing = message.senderId === getDevUserId();
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

function keyExtractor(item: Row) {
  return item.id;
}

/** How near inverted offset 0 (newest) before MVCP reveals inserted rows. */
const NEAR_LATEST_PX = 80;

export function ThreadScreen({
  conversation,
  initialMessages,
}: ThreadScreenProps) {
  const me = getDevUser();
  const keyboardInset = useKeyboardInset();
  const hostRef = useRef<View>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const stickToLatestRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menu, setMenu] = useState<ReactionAnchor | null>(null);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setMessages(initialMessages);
    setReplyTo(null);
    setMenu(null);
  });
  const isGroup = conversation.kind === "group" || conversation.id === "offers";
  const rows = useMemo(() => buildRows(messages, isGroup), [messages, isGroup]);

  const quotedById = useMemo(() => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    const out = new Map<string, QuotedMessage>();
    for (const message of messages) {
      if (!message.replyToId) continue;
      const quoted = byId.get(message.replyToId);
      if (!quoted) continue;
      out.set(message.id, {
        name: personName(quoted.senderId),
        body: quotePreview(quoted.body),
        isMe: quoted.senderId === getDevUserId(),
      });
    }
    return out;
  }, [messages]);

  const replyQuote = useMemo(() => {
    if (!replyTo) return null;
    return { name: personName(replyTo.senderId), body: quotePreview(replyTo.body) };
  }, [replyTo]);

  const menuOpen = menu !== null;
  const menuId = menu?.messageId ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenu(null);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen]);

  const dismissMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openMenu = useCallback((payload: OpenMenuPayload) => {
    const host = hostRef.current;
    if (!host) return;
    const screen = Dimensions.get("window");
    host.measureInWindow((hx, hy, hw, hh) => {
      const next = anchorFromPayload(
        payload,
        { x: hx, y: hy, width: hw, height: hh },
        screen,
      );
      if (next) setMenu(next);
    });
  }, []);

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, reactions: toggleReaction(m.reactions, emoji, me.id) }
            : m,
        ),
      );
      setMenu(null);
    },
    [me.id],
  );

  const handleReply = useCallback(
    (messageId: string) => {
      // Reading `messages` directly: setting state from inside a setMessages
      // updater made the updater impure, so React (StrictMode + the compiler)
      // re-ran it and queued a second render — a visible extra layout pass.
      const target = messages.find((m) => m.id === messageId);
      if (target) setReplyTo(target);
      setMenu(null);
    },
    [messages],
  );

  function send() {
    const body = draft.trim();
    if (!body) return;
    const id = `local-${Date.now()}`;
    setDraft("");
    setReplyTo(null);
    // MVCP keeps the prior newest row fixed; after layout, pin offset 0 so the
    // sent bubble clears the composer (autoscroll threshold alone skips if the
    // user had scrolled up slightly).
    stickToLatestRef.current = true;
    setMessages((prev) => [
      ...prev,
      {
        id,
        conversationId: conversation.id,
        senderId: me.id,
        body,
        createdAt: new Date().toISOString(),
        status: "sent",
        replyToId: replyTo?.id,
      },
    ]);
  }

  const onContentSizeChange = useCallback(() => {
    if (!stickToLatestRef.current) return;
    stickToLatestRef.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "day") {
        return (
          <View className="my-2 items-center">
            <Text variant="label" className="font-medium text-muted">
              {item.label}
            </Text>
          </View>
        );
      }
      return (
        <MessageBubble
          messageId={item.message.id}
          body={item.message.body}
          outgoing={item.message.senderId === getDevUserId()}
          status={item.message.status}
          senderName={item.senderName}
          quoted={quotedById.get(item.message.id)}
          reactions={item.message.reactions}
          currentUserId={me.id}
          selected={menuId === item.message.id}
          enter={item.message.id.startsWith("local-")}
          onOpenMenu={openMenu}
          onReply={handleReply}
          onToggleReaction={handleToggleReaction}
        />
      );
    },
    [handleReply, handleToggleReaction, me.id, menuId, openMenu, quotedById],
  );

  const host = (
    <View ref={hostRef} collapsable={false} className="flex-1">
      <FlatList
        ref={listRef}
        inverted
        className="flex-1"
        scrollEnabled={!menuOpen}
        extraData={menuId}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 py-2"
        data={rows}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={onContentSizeChange}
        // Anchor mid-thread when rows insert. Without MVCP, composer height
        // changes yank to offset 0. Without autoscrollToTopThreshold, new
        // index-0 rows stay under the composer while you were near latest.
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: NEAR_LATEST_PX,
        }}
        renderItem={renderItem}
        refreshControl={makeRefreshControl(refreshing, onRefresh, {
          inverted: true,
        })}
      />
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={send}
        replyTo={replyQuote}
        onCancelReply={() => setReplyTo(null)}
        keyboardInset={keyboardInset}
      />
      {menu ? (
        <MessageActions
          anchor={menu}
          onDismiss={dismissMenu}
          onReact={(emoji) => handleToggleReaction(menu.messageId, emoji)}
          onReply={() => handleReply(menu.messageId)}
        />
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <ThreadHeader conversation={conversation} />
      </InScreenHeader>
      {/*
        Android too: edge-to-edge sets `setDecorFitsSystemWindows(false)`, which
        makes `softwareKeyboardLayoutMode: "resize"` a no-op — the window never
        resizes and MainActivity pads only for system bars, so the composer and
        its reply banner sit behind the IME unless something lifts them.
        `useKeyboardInset` reports residual overlap only (raw height minus what
        a host like Expo Go already absorbed via window resize). See
        lib/keyboard-inset.ts. KeyboardAvoidingView cannot, because it measures
        against a parent-relative frame.
      */}
      <View className="flex-1" style={{ paddingBottom: keyboardInset }}>
        {host}
      </View>
    </View>
  );
}
