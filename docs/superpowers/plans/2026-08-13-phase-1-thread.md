# Phase 1 Plan 3 — Thread + composer + optimistic send

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/chat/[id]` is a simple light thread: header name + subtitle, grey in / primary out pills, date dividers, pill composer, optimistic mock send. Offers group works. RBAC still gates entry.

**Architecture:** Root Stack already owns `chat/[id]` chrome (`app/_layout.tsx` — do **not** add `app/chat/_layout.tsx`). Route gates + hydrates, then composes `components/chat/*`. Optimistic messages overlay in component state — never mutate exported `MESSAGES`. Internal notes are not rendered.

**Tech Stack:** Expo SDK 57, Expo Router, Uniwind, RNR Avatar/Text/Input, lucide-react-native, pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-phase-1-ui-design.md` §7. Depends on Plan 1 types/mock + Plan 2 `conversationTitle` + `lib/display.ts`.
- Rejected looks: old “tool” thread mock, Messenger dark, red outgoing, GIF/mic/camera/thumbs-up, in-bubble identity on every 1:1 message, mono `conv-assigned` in header.
- Incoming fill = white `#FFFFFF` (light) / gray `#2A2E3B` (dark); outgoing = `primary` `#3452D9`; bubble radius ~18–20. Light `bg` + `surface` composer.
- Attach `+` is **dead**. Send requires non-empty body. Optimistic: append `status: 'sending'` then immediately `'sent'`. Do not `fetch`. Do not mutate `MESSAGES`.
- `id` param: `const id = Array.isArray(raw) ? raw[0] : raw`. Do not `Redirect` until params have hydrated (`raw !== undefined`).
- `canViewConversation(DEV_ROLE, DEV_USER_ID, conversation)` — else `Redirect` to `ROLE_HREF[DEV_ROLE]`.
- Internal notes: do not render. Capability ≠ UI this phase.
- Group/Offers: small `displayName` above **incoming** only. 1:1: no per-bubble name.
- Header subtitle: 1:1 → `Person.lastActiveLabel`; group/Offers → `{n} participants`. Optional tiny Assigned / Unassigned / Resolved pill — not a stepper.
- Do not import `@react-navigation/*`. `useNavigation` / `Redirect` / `useLocalSearchParams` from `expo-router` only.
- Do not install keyboard-controller or FlashList. Inverted `FlatList` is enough.
- pnpm only. Never edit `.env`. No commits unless asked. No `console.log` of message bodies.
- Root `app/_layout.tsx`: `chat/[id]` stays `headerShown: false`. Thread chrome is `InScreenHeader` + `ThreadHeader` with `screenTopPad` (same top as hub/search). Do not `setOptions` a native chat header. Do not leave `title: 'Chat'` on the Stack.Screen.

## Amendments (runtime — write here, do not freelance)

1. **Incoming bubble token:** `bg-bubble-in` (`--color-bubble-in` in `@theme` + both `@variant`s), not `bg-[#F2F2F2]`. Uniwind-rnr forbids arbitrary palette hex. Outgoing text: `text-primary-foreground`.
2. **Chat `id`:** open threads with `chatHref(id)` → `{ pathname: '/chat/[id]', params: { id } }`. String `/chat/${id}` fills params on **web**; native Expo Go often mounts `chat/[id]` with empty params (header stays “Chat”). After Metro reload, still fall back to `chatIdFromRoute` + `chatIdFromSegments`. If `id` still cannot be resolved → `Redirect` to `ROLE_HREF[DEV_ROLE]` (no infinite “Opening conversation…”). Never `return null`.
3. **Android KAV:** do not wrap inverted `FlatList` in `KeyboardAvoidingView` on Android (zero-height list). iOS keeps KAV as in Task 3.
4. **Avatar `alt`:** RNR Avatar requires `alt`. Pass `alt={title}` on `ThreadHeader`.
5. **In-screen chat chrome:** `InScreenHeader` (back + `screenTopPad`) + `ThreadHeader`. Same top inset as hub/search. Do not StyleSheet the thread. Do not `setOptions` native headerTitle.
6. **Empty “Chat” flash:** Stack.Screen `chat/[id]` stays `headerShown: false`, no `title: 'Chat'`. Unresolved id → `Redirect` with no native “Chat” chrome.
7. **Receipts outside the bubble:** ticks only under the pill (Check = sent/sending, CheckCheck = delivered, primary CheckCheck = read). No Sent/Delivered/Read labels. Outgoing bubble `rounded-[22px] rounded-br-md`; incoming `rounded-bl-md`. Mock thread includes emoji + mixed statuses so receipts can be previewed.
8. **Reactions + reply (Meta/Messenger chrome, light theme):** `Message.replyToId?` + `Message.reactions?`. Swipe right → quick reply. Long-press → emoji pill **on** the bubble + Reply **below** (absolute; no Modal coords). Tray: Reanimated `ZoomIn` spring + staggered emoji `ZoomIn`; Reply `FadeIn`. Focused bubble: micro scale bounce + `bg-ink` tint (incoming `/12`, outgoing `/25`). X inset 22 toward center (incoming right / outgoing left). Selected row `CellRendererComponent` `zIndex` + `elevation`. Composer stays. No new packages. Quote fused above the message. Reaction badge on the corner. `lib/message-react.ts`. Not Messenger dark, not call/video, not thumbs-up composer.
9. **Chat chrome tightness:** Native-stack ignores JS `headerStatusBarHeight`. Android: `disableTopInsetApplication` only (do not stack a second status inset). Keep system 3-button / gesture bar visible (`NavigationBar hidden={false}`, `style="dark"` = dark icons on white chin). Composer sits above it — no extra Android `paddingBottom`. iOS home-indicator pad lives **inside** `bg-surface`. Root stack `ios_from_right`.
10. **Thread open jitter:** no `setOptions` on ThreadScreen (Expo Router throws if called during render; native headerTitle also used a different top inset than hub/search). Existing bubbles do **not** use Reanimated `entering`; only optimistic `local-*` sends fade in. Incoming token light `#FFFFFF` / dark `#2A2E3B` vs `bg` `#F5F6F9`.

## File map

| Path                                  | Responsibility                                 |
| ------------------------------------- | ---------------------------------------------- |
| `lib/message-day.ts`                  | Date divider key + label                       |
| `lib/message-day.test.ts`             | Day-change cases                               |
| `components/chat/message-bubble.tsx`  | Pill + quote + reaction chips + ticks          |
| `components/chat/message-actions.tsx` | Absolute emoji-on-bubble + Reply-below         |
| `components/chat/composer.tsx`        | Pill input + dead attach + send + reply banner |
| `lib/message-react.ts`                | toggleReaction + quotePreview                  |
| `components/chat/thread-header.tsx`   | Back is native; custom title block             |
| `components/chat/thread-screen.tsx`   | List + optimistic send + header options        |
| `app/chat/[id].tsx`                   | Hydrate + RBAC gate + compose `ThreadScreen`   |

---

### Task 1: Day divider helper (TDD)

**Files:**

- Create: `lib/message-day.ts`
- Create: `lib/message-day.test.ts`

**Interfaces:**

- Consumes: ISO `createdAt`
- Produces: `dayKey(iso)`, `formatDayLabel(iso, nowMs?)`, `shouldShowDayDivider(currentIso, previousIso)`

- [ ] **Step 1: Write failing tests**

```ts
import {
  dayKey,
  formatDayLabel,
  shouldShowDayDivider,
} from "@/lib/message-day";

describe("dayKey", () => {
  test("UTC calendar day", () => {
    expect(dayKey("2026-08-13T08:00:00.000Z")).toBe("2026-08-13");
    expect(dayKey("2026-08-12T16:05:00.000Z")).toBe("2026-08-12");
  });
});

describe("shouldShowDayDivider", () => {
  test("true when previous is missing or different day", () => {
    expect(shouldShowDayDivider("2026-08-13T08:00:00.000Z", undefined)).toBe(
      true,
    );
    expect(
      shouldShowDayDivider(
        "2026-08-13T08:12:00.000Z",
        "2026-08-13T08:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      shouldShowDayDivider(
        "2026-08-13T08:00:00.000Z",
        "2026-08-12T16:05:00.000Z",
      ),
    ).toBe(true);
  });
});

describe("formatDayLabel", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");

  test("today / yesterday / date", () => {
    expect(formatDayLabel("2026-08-13T08:00:00.000Z", now)).toBe("Today");
    expect(formatDayLabel("2026-08-12T16:05:00.000Z", now)).toBe("Yesterday");
    expect(formatDayLabel("2026-08-10T10:00:00.000Z", now)).toBe("Aug 10");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm test -- lib/message-day.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/message-day.ts`**

```ts
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function shouldShowDayDivider(
  currentIso: string,
  previousIso?: string,
): boolean {
  if (!previousIso) return true;
  return dayKey(currentIso) !== dayKey(previousIso);
}

function utcYmd(ms: number): { y: number; m: number; d: number } {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export function formatDayLabel(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const a = utcYmd(then);
  const b = utcYmd(nowMs);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return "Today";
  const yesterday = utcYmd(nowMs - 86_400_000);
  if (a.y === yesterday.y && a.m === yesterday.m && a.d === yesterday.d)
    return "Yesterday";
  return `${MONTHS[a.m]} ${a.d}`;
}
```

Use UTC so jest + mock ISO strings stay stable on Windows.

- [ ] **Step 4: Run — expect PASS**

```powershell
pnpm test -- lib/message-day.test.ts
```

Expected: PASS.

---

### Task 2: Bubble + composer

**Files:**

- Create: `components/chat/message-bubble.tsx`
- Create: `components/chat/composer.tsx`

**Interfaces:**

- Consumes: `Message`, `Person`, `initials` not needed on 1:1; `Check` / `CheckCheck` from lucide
- Produces: `MessageBubble`, `Composer`

- [ ] **Step 1: Create `components/chat/message-bubble.tsx`**

```tsx
import { Check, CheckCheck } from "lucide-react-native";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import type { Message, MessageStatus } from "@/lib/types";

type MessageBubbleProps = {
  body: string;
  outgoing: boolean;
  status: MessageStatus;
  senderName?: string;
};

function Ticks({
  status,
  outgoing,
}: {
  status: MessageStatus;
  outgoing: boolean;
}) {
  if (!outgoing) return null;
  if (status === "sending") {
    return (
      <Text className="mt-1 text-right font-sans text-[10px] text-primary-foreground/80">
        Sending
      </Text>
    );
  }
  const color = status === "read" ? "#FFFFFF" : "rgba(255,255,255,0.85)";
  const Icon = status === "sent" ? Check : CheckCheck;
  return (
    <View className="mt-1 items-end">
      <Icon color={color} size={12} />
    </View>
  );
}

export function MessageBubble({
  body,
  outgoing,
  status,
  senderName,
}: MessageBubbleProps) {
  return (
    <View
      className={cn("mb-2 max-w-[78%]", outgoing ? "self-end" : "self-start")}
    >
      {senderName ? (
        <Text className="mb-1 px-1 font-sans text-xs text-muted">
          {senderName}
        </Text>
      ) : null}
      <View
        className={cn(
          "px-3.5 py-2.5",
          outgoing ? "bg-primary" : "bg-bubble-in",
        )}
        style={{ borderRadius: 18 }}
      >
        <Text
          className={cn(
            "font-sans text-[15px] leading-5",
            outgoing ? "text-primary-foreground" : "text-ink",
          )}
        >
          {body}
        </Text>
        <Ticks status={status} outgoing={outgoing} />
      </View>
    </View>
  );
}
```

No identity block inside 1:1 bubbles. `senderName` only when the parent passes it (group incoming).

- [ ] **Step 2: Create `components/chat/composer.tsx`**

```tsx
import { Plus, Send } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Input } from "@/components/ui/input";
import { colors } from "@/lib/tokens";

type ComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
};

export function Composer({ value, onChangeText, onSend }: ComposerProps) {
  const canSend = value.trim().length > 0;

  return (
    <View className="flex-row items-end gap-2 border-t border-line bg-surface px-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach"
        onPress={() => undefined}
        className="mb-1 size-11 items-center justify-center rounded-full bg-bg"
      >
        <Plus color={colors.inkSoft} size={22} />
      </Pressable>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder="Message…"
        accessibilityLabel="Message"
        multiline
        className="min-h-11 max-h-28 flex-1 rounded-full border-line bg-bg px-4 py-2.5 shadow-none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        disabled={!canSend}
        onPress={onSend}
        className="mb-1 size-11 items-center justify-center rounded-full bg-primary"
        style={{ opacity: canSend ? 1 : 0.4 }}
      >
        <Send color="#FFFFFF" size={18} />
      </Pressable>
    </View>
  );
}
```

No GIF, mic, camera, or thumbs-up. Attach stays dead.

---

### Task 3: Thread header + thread screen

**Files:**

- Create: `components/chat/thread-header.tsx`
- Create: `components/chat/thread-screen.tsx`

**Interfaces:**

- Consumes: `Conversation`, `Message`, `Person`, `conversationTitle`, `LABELS`, `PEOPLE`, `DEV_USER_ID`, `getDevUser`, `formatDayLabel`, `shouldShowDayDivider`, `MessageBubble`, `Composer`
- Produces: `ThreadHeader`, `ThreadScreen` (`conversation: Conversation`, `initialMessages: Message[]`)

- [ ] **Step 1: Create `components/chat/thread-header.tsx`**

```tsx
import { View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { conversationTitle } from "@/lib/conversation-title";
import { initials } from "@/lib/display";
import { DEV_USER_ID, LABELS, PEOPLE } from "@/lib/mock-data";
import type { Conversation } from "@/lib/types";

type ThreadHeaderProps = {
  conversation: Conversation;
};

function statusPill(conversation: Conversation): string | null {
  if (
    conversation.labelIds.some(
      (id) => LABELS.find((l) => l.id === id)?.name === "Resolved",
    )
  ) {
    return "Resolved";
  }
  if (conversation.assigneeId === null) return "Unassigned";
  return "Assigned";
}

export function ThreadHeader({ conversation }: ThreadHeaderProps) {
  const title = conversationTitle(conversation, PEOPLE, DEV_USER_ID);
  const otherId = conversation.participantIds.find((id) => id !== DEV_USER_ID);
  const other = PEOPLE.find((p) => p.id === otherId);
  const isGroup = conversation.kind === "group" || conversation.id === "offers";
  const subtitle = isGroup
    ? `${conversation.participantIds.length} participants`
    : (other?.lastActiveLabel ?? "");
  const pill = statusPill(conversation);

  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2 pr-3">
      <Avatar alt={title} className="size-9">
        <AvatarFallback className="bg-primary-soft">
          <Text className="font-sans text-xs font-semibold text-primary">
            {initials(title)}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans text-base font-semibold text-ink"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="font-sans text-xs text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {pill ? (
        <View className="rounded-full bg-bg px-2 py-1">
          <Text className="font-sans text-[11px] text-ink-soft">{pill}</Text>
        </View>
      ) : null}
    </View>
  );
}
```

This is a header **title** slot, not a second back button. Native stack keeps back.

- [ ] **Step 2: Create `components/chat/thread-screen.tsx`**

```tsx
import { useNavigation } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Composer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ThreadHeader } from "@/components/chat/thread-header";
import { Text } from "@/components/ui/text";
import { formatDayLabel, shouldShowDayDivider } from "@/lib/message-day";
import { DEV_USER_ID, PEOPLE, getDevUser } from "@/lib/mock-data";
import type { Conversation, Message } from "@/lib/types";

type ThreadScreenProps = {
  conversation: Conversation;
  initialMessages: Message[];
};

type Row =
  | { type: "day"; id: string; label: string }
  | { type: "message"; id: string; message: Message; senderName?: string };

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
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const me = getDevUser();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const isGroup = conversation.kind === "group" || conversation.id === "offers";
  const rows = useMemo(() => buildRows(messages, isGroup), [messages, isGroup]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <ThreadHeader conversation={conversation} />,
      title: "",
    });
  }, [navigation, conversation]);

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
    };
    setDraft("");
    setMessages((prev) => [...prev, base]);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "sent" } : m)),
    );
  }

  const list = (
    <>
      <FlatList
        inverted
        className="flex-1"
        contentContainerClassName="px-4 py-3"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.type === "day") {
            return (
              <View className="my-3 items-center">
                <Text className="font-sans text-xs text-muted">
                  {item.label}
                </Text>
              </View>
            );
          }
          return (
            <MessageBubble
              body={item.message.body}
              outgoing={item.message.senderId === DEV_USER_ID}
              status={item.message.status}
              senderName={item.senderName}
            />
          );
        }}
      />
      <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <Composer value={draft} onChangeText={setDraft} onSend={send} />
      </View>
    </>
  );

  if (Platform.OS === "android") {
    return <View className="flex-1 bg-bg">{list}</View>;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior="padding"
      keyboardVerticalOffset={88}
    >
      {list}
    </KeyboardAvoidingView>
  );
}
```

`buildRows` returns newest-first because `inverted` FlatList reads index 0 at the bottom. Day rows sit above the first message of that day in chronological order; after reverse they still appear as dividers in the inverted list.

Do not import or render `INTERNAL_NOTES`.

---

### Task 4: Thin chat route

**Files:**

- Modify: `app/chat/[id].tsx`

**Interfaces:**

- Consumes: `ThreadScreen`, `CONVERSATIONS`, `MESSAGES`, `canViewConversation`, `DEV_ROLE`, `DEV_USER_ID`, `ROLE_HREF`
- Produces: gated `/chat/[id]` including `/chat/offers`

- [ ] **Step 1: Replace `app/chat/[id].tsx`**

```tsx
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";

import { ThreadScreen } from "@/components/chat/thread-screen";
import { chatIdFromRoute, chatIdFromSegments } from "@/lib/chat-route-id";
import {
  CONVERSATIONS,
  DEV_ROLE,
  DEV_USER_ID,
  MESSAGES,
  ROLE_HREF,
} from "@/lib/mock-data";
import { canViewConversation } from "@/lib/rbac";

export default function ChatScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id;
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id;
  const pathname = usePathname();
  const id =
    chatIdFromRoute(local, pathname) ??
    chatIdFromRoute(global, pathname) ??
    chatIdFromSegments(useSegments());
  const conversation = id ? CONVERSATIONS.find((c) => c.id === id) : undefined;

  if (
    !id ||
    !conversation ||
    !canViewConversation(DEV_ROLE, DEV_USER_ID, conversation)
  ) {
    return <Redirect href={ROLE_HREF[DEV_ROLE]} />;
  }

  const initialMessages = MESSAGES.filter(
    (m) => m.conversationId === conversation.id,
  );

  return (
    <ThreadScreen
      conversation={conversation}
      initialMessages={initialMessages}
    />
  );
}
```

Do not add `app/chat/_layout.tsx`. Do not change root Stack `animation` / `stackChrome` unless the header title slot clips — if it does, keep `stackChrome` and only `setOptions` on this screen.

- [ ] **Step 2: Tests**

```powershell
pnpm test -- lib/rbac.test.ts lib/display.test.ts lib/conversation-title.test.ts lib/inbox-filter.test.ts lib/message-day.test.ts
```

Expected: PASS.

- [ ] **Step 3: Manual thread checks**

`DEV_ROLE = 'contact'`:

- Hub recent → `/chat/conv-assigned`: header **Jonah Reed** + `Active now` (or that person’s `lastActiveLabel`), Assigned pill, no mono id, grey in / blue out, no sender names on bubbles, composer send appends outgoing pill.
- Attach does nothing. Empty send does nothing.
- Hub Join Offers → `/chat/offers`: header **Offers** + `5 participants`, incoming shows **Amina Okonkwo** (or sender name) above grey pills.

`DEV_ROLE = 'agent'`:

- Open `conv-unassigned` from Unassigned: Unassigned pill. Contact cannot open this id (Redirect).
- Internal note on `conv-assigned` is not visible.

`DEV_ROLE = 'admin'`:

- Any thread opens. Users/Overview still placeholders.

Visual: light chrome only. Outgoing never red. No GIF/mic/camera row.

---

## Self-review

- Spec §7 header / list / composer / RBAC / id param / no internal notes → Tasks 2–4.
- Spec §3.4 Offers id `'offers'` → Task 4 + Plan 1 fixtures.
- Spec §10 out of scope: no keyboard-controller, FlashList, uploads, in-thread search.
- Modular example in `.cursor/rules/modular.mdc` matches: gate in route; header / list / composer extracted (`ThreadScreen` owns list + send state — one owner for optimistic overlay).
- State rule: overlay `useState`, no mutate `MESSAGES`, no fetch.
- A11y: Attach + Send + Message input labeled; hit targets 44.
- Visual-fidelity: `#F2F2F2` in, primary out, dead attach, no dark/maroon/red.
