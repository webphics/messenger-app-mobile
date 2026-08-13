# Phase 1 Plan 2 — Inbox + filter + shared row

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `InboxScreen` powers Contact Messages, Agent Chats, Agent Unassigned, and Admin Conversations — search, All/Open/Resolved chips, rows with unread pills + online dots, Offers megaphone row.

**Architecture:** Pure filter + title helpers in `lib/`. Feature UI in `components/inbox/`. Routes stay thin: pick the conversation list, pass `showChips` / `showCompose`. Do not start this plan until Plan 1 hub Messages push lands on `/(contact)/messages`.

**Tech Stack:** Expo SDK 57, Expo Router, Uniwind, RNR Avatar/Text/Input, lucide-react-native, jest-expo, pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-phase-1-ui-design.md` §6 + §9. Depends on Plan 1 types/mock (`unreadCount`, `isOnline`, `lastActiveLabel`, `Resolved` label, `offers` conversation, `lib/display.ts`).
- No CaseStatus type. Open = conversation does **not** include a label named `Resolved`. Resolved = includes that label. All = no chip filter.
- Agent Unassigned: `assigneeId === null` only. **Hide chips.** Hide compose.
- Agent Chats: assigned **or** participant (includes Offers if in group). **Not** the unassigned pool. Header title already **Messages** via `(agent)/_layout.tsx`. Tab label **Chats**.
- Admin Conversations: all threads. Header title already **Messages**. Tab label **Conversations**.
- Contact Messages: `canViewConversation` list (offers already includes `contact-1`). Stack push from hub with native back. No Contact tab bar.
- Compose icon visible + **dead** on Contact / Agent Chats / Admin Conversations. No `Alert('coming soon')`. No new-thread flow.
- Do not import `@react-navigation/*`. Navigation only from `expo-router` (`useNavigation` from `expo-router` is OK).
- pnpm only. Never edit `.env`. No commits unless asked. No screen snapshot tests.
- Do not mutate `CONVERSATIONS`. Search/chip state is `useState` on `InboxScreen`.

## File map

| Path | Responsibility |
|---|---|
| `lib/conversation-title.ts` | Inbox/thread title rule |
| `lib/conversation-title.test.ts` | Title cases |
| `lib/inbox-filter.ts` | `listInboxConversations`, `filterConversations`, `isResolved` |
| `lib/inbox-filter.test.ts` | Visibility + chip + search |
| `components/inbox/conversation-row.tsx` | One row |
| `components/inbox/inbox-screen.tsx` | Search + chips + list + header chrome |
| `app/(contact)/messages.tsx` | Contact inbox |
| `app/(agent)/index.tsx` | Agent Chats inbox |
| `app/(agent)/unassigned.tsx` | Unassigned pool, no chips |
| `app/(admin)/conversations.tsx` | Admin inbox |

---

### Task 1: Title helper (TDD)

**Files:**
- Create: `lib/conversation-title.ts`
- Create: `lib/conversation-title.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `Person`
- Produces: `conversationTitle(conversation, people, selfId): string`

- [ ] **Step 1: Write failing tests**

```ts
import { conversationTitle } from '@/lib/conversation-title'
import type { Conversation, Person } from '@/lib/types'

const people: Person[] = [
  {
    id: 'agent-1',
    displayName: 'Jonah Reed',
    role: 'agent',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'contact-1',
    displayName: 'Luis Ferreira',
    role: 'contact',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 3h ago',
  },
]

const base = {
  participantIds: ['contact-1', 'agent-1'],
  assigneeId: 'agent-1',
  labelIds: [] as string[],
  lastMessagePreview: 'Hi',
  updatedAt: '2026-08-13T08:00:00.000Z',
  unreadCount: 0,
}

describe('conversationTitle', () => {
  test('offers id is Offers', () => {
    const c: Conversation = { ...base, id: 'offers', kind: 'group', subject: 'Offers' }
    expect(conversationTitle(c, people, 'contact-1')).toBe('Offers')
  })

  test('direct uses the other participant name', () => {
    const c: Conversation = {
      ...base,
      id: 'conv-assigned',
      kind: 'direct',
      subject: 'Cannot reset password',
    }
    expect(conversationTitle(c, people, 'contact-1')).toBe('Jonah Reed')
    expect(conversationTitle(c, people, 'agent-1')).toBe('Luis Ferreira')
  })

  test('group uses subject or Group', () => {
    const named: Conversation = {
      ...base,
      id: 'conv-group',
      kind: 'group',
      subject: 'Warehouse onboarding',
    }
    const unnamed: Conversation = { ...named, id: 'g2', subject: null }
    expect(conversationTitle(named, people, 'contact-1')).toBe('Warehouse onboarding')
    expect(conversationTitle(unnamed, people, 'contact-1')).toBe('Group')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm test -- lib/conversation-title.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/conversation-title.ts`**

```ts
import type { Conversation, Person } from '@/lib/types'

export function conversationTitle(
  conversation: Conversation,
  people: Person[],
  selfId: string,
): string {
  if (conversation.id === 'offers') return 'Offers'
  if (conversation.kind === 'group') return conversation.subject ?? 'Group'
  const otherId = conversation.participantIds.find((id) => id !== selfId)
  const other = people.find((p) => p.id === otherId)
  return other?.displayName ?? conversation.subject ?? 'Chat'
}
```

- [ ] **Step 4: Run — expect PASS**

```powershell
pnpm test -- lib/conversation-title.test.ts
```

Expected: PASS.

---

### Task 2: Inbox filter (TDD)

**Files:**
- Create: `lib/inbox-filter.ts`
- Create: `lib/inbox-filter.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `Label`, `UserRole`, `canViewConversation`
- Produces: `InboxChip`, `isResolved`, `listInboxConversations`, `filterConversations`

- [ ] **Step 1: Write failing tests**

```ts
import { filterConversations, isResolved, listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, LABELS, PEOPLE } from '@/lib/mock-data'

const resolved = CONVERSATIONS.find((c) => c.id === 'conv-group')!
const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned')!
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned')!
const offers = CONVERSATIONS.find((c) => c.id === 'offers')!

describe('isResolved', () => {
  test('Resolved label name, not id', () => {
    expect(isResolved(resolved, LABELS)).toBe(true)
    expect(isResolved(assigned, LABELS)).toBe(false)
  })
})

describe('listInboxConversations', () => {
  test('contact sees only participating threads including offers', () => {
    const list = listInboxConversations('contact', 'contact-1', CONVERSATIONS)
    expect(list.map((c) => c.id).sort()).toEqual(['conv-assigned', 'conv-group', 'offers'])
  })

  test('agent chats exclude unassigned pool', () => {
    const list = listInboxConversations('agent', 'agent-1', CONVERSATIONS)
    expect(list.map((c) => c.id).sort()).toEqual(['conv-assigned', 'conv-group', 'offers'])
    expect(list.some((c) => c.id === 'conv-unassigned')).toBe(false)
  })

  test('admin sees all', () => {
    expect(listInboxConversations('admin', 'admin-1', CONVERSATIONS)).toHaveLength(
      CONVERSATIONS.length,
    )
  })
})

describe('filterConversations', () => {
  const all = CONVERSATIONS

  test('all chip returns the list', () => {
    expect(filterConversations(all, '', 'all', LABELS, PEOPLE, 'agent-1')).toEqual(all)
  })

  test('open excludes Resolved label', () => {
    const ids = filterConversations(all, '', 'open', LABELS, PEOPLE, 'agent-1').map((c) => c.id)
    expect(ids).toContain(assigned.id)
    expect(ids).not.toContain(resolved.id)
  })

  test('resolved only includes Resolved label', () => {
    const ids = filterConversations(all, '', 'resolved', LABELS, PEOPLE, 'agent-1').map((c) => c.id)
    expect(ids).toEqual([resolved.id])
  })

  test('query matches title or preview', () => {
    const byName = filterConversations(all, 'luis', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byName.map((c) => c.id)).toContain(assigned.id)

    const byPreview = filterConversations(all, 'march invoice', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byPreview.map((c) => c.id)).toEqual([unassigned.id])

    const byOffers = filterConversations(all, 'offers', 'all', LABELS, PEOPLE, 'agent-1')
    expect(byOffers.map((c) => c.id)).toContain(offers.id)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm test -- lib/inbox-filter.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/inbox-filter.ts`**

```ts
import { conversationTitle } from '@/lib/conversation-title'
import { canViewConversation } from '@/lib/rbac'
import type { Conversation, Label, Person, UserRole } from '@/lib/types'

export type InboxChip = 'all' | 'open' | 'resolved'

export function isResolved(conversation: Conversation, labels: Label[]): boolean {
  return conversation.labelIds.some(
    (id) => labels.find((label) => label.id === id)?.name === 'Resolved',
  )
}

export function listInboxConversations(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation[] {
  if (role === 'admin') return conversations
  if (role === 'contact') {
    return conversations.filter((c) => canViewConversation(role, userId, c))
  }
  return conversations.filter(
    (c) => c.assigneeId === userId || c.participantIds.includes(userId),
  )
}

export function filterConversations(
  list: Conversation[],
  query: string,
  chip: InboxChip,
  labels: Label[],
  people: Person[],
  selfId: string,
): Conversation[] {
  const q = query.trim().toLowerCase()
  return list.filter((conversation) => {
    if (chip === 'open' && isResolved(conversation, labels)) return false
    if (chip === 'resolved' && !isResolved(conversation, labels)) return false
    if (!q) return true
    const title = conversationTitle(conversation, people, selfId).toLowerCase()
    const preview = conversation.lastMessagePreview.toLowerCase()
    const subject = (conversation.subject ?? '').toLowerCase()
    return title.includes(q) || preview.includes(q) || subject.includes(q)
  })
}
```

- [ ] **Step 4: Run — expect PASS**

```powershell
pnpm test -- lib/conversation-title.test.ts lib/inbox-filter.test.ts lib/rbac.test.ts
```

Expected: PASS.

---

### Task 3: Row + InboxScreen

**Files:**
- Create: `components/inbox/conversation-row.tsx`
- Create: `components/inbox/inbox-screen.tsx`

**Interfaces:**
- Consumes: `Conversation`, `conversationTitle`, `filterConversations`, `formatRelativeTime`, `initials`, `DEV_USER_ID`, `PEOPLE`, `LABELS`, `router.push('/chat/:id')`
- Produces: `ConversationRow`, `InboxScreen`

- [ ] **Step 1: Create `components/inbox/conversation-row.tsx`**

```tsx
import { Megaphone } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { conversationTitle } from '@/lib/conversation-title'
import { formatRelativeTime, initials } from '@/lib/display'
import { DEV_USER_ID, PEOPLE } from '@/lib/mock-data'
import { colors } from '@/lib/tokens'
import type { Conversation } from '@/lib/types'

type ConversationRowProps = {
  conversation: Conversation
  onPress: () => void
}

function otherPerson(conversation: Conversation) {
  const otherId = conversation.participantIds.find((id) => id !== DEV_USER_ID)
  return PEOPLE.find((p) => p.id === otherId)
}

export function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const title = conversationTitle(conversation, PEOPLE, DEV_USER_ID)
  const isOffers = conversation.id === 'offers'
  const other = otherPerson(conversation)
  const online = isOffers ? false : Boolean(other?.isOnline)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 px-4 py-3"
    >
      <View>
        <Avatar className="size-12">
          {isOffers ? (
            <AvatarFallback className="bg-primary">
              <Megaphone color="#FFFFFF" size={22} />
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-primary-soft">
              <Text className="font-sans text-sm font-semibold text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          )}
        </Avatar>
        {online ? (
          <View
            accessibilityLabel="Online"
            className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success"
          />
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 font-sans text-sm text-muted" numberOfLines={1}>
          {conversation.lastMessagePreview} · {formatRelativeTime(conversation.updatedAt)}
        </Text>
      </View>

      {conversation.unreadCount > 0 ? (
        <View className="min-h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5">
          <Text className="font-sans text-xs font-semibold text-white">
            {conversation.unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
```

Unread count pill stays even when online (a11y: not color-only). Online is extra; unread text remains.

- [ ] **Step 2: Create `components/inbox/inbox-screen.tsx`**

```tsx
import { useNavigation, useRouter } from 'expo-router'
import { SquarePen } from 'lucide-react-native'
import { useLayoutEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { ConversationRow } from '@/components/inbox/conversation-row'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { chatHref } from '@/lib/chat-route-id'
import { filterConversations, type InboxChip } from '@/lib/inbox-filter'
import { DEV_USER_ID, LABELS, PEOPLE } from '@/lib/mock-data'
import { colors } from '@/lib/tokens'
import type { Conversation } from '@/lib/types'

const CHIPS: { id: InboxChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
]

type InboxScreenProps = {
  conversations: Conversation[]
  showChips: boolean
  showCompose: boolean
  title: string
}

export function InboxScreen({ conversations, showChips, showCompose, title }: InboxScreenProps) {
  const router = useRouter()
  const navigation = useNavigation()
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<InboxChip>('all')

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: showCompose
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              className="mr-3 size-11 items-center justify-center"
              onPress={() => undefined}
            >
              <SquarePen color={colors.ink} size={22} />
            </Pressable>
          )
        : undefined,
    })
  }, [navigation, showCompose, title])

  const visible = useMemo(
    () => filterConversations(conversations, query, showChips ? chip : 'all', LABELS, PEOPLE, DEV_USER_ID),
    [conversations, query, chip, showChips],
  )

  return (
    <View className="flex-1 bg-bg">
      <View className="bg-surface px-4 pb-3 pt-2">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          accessibilityLabel="Search conversations"
          className="h-11 rounded-full border-line bg-bg shadow-none"
        />
        {showChips ? (
          <View className="mt-3 flex-row gap-2">
            {CHIPS.map((item) => {
              const selected = item.id === chip
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected }}
                  onPress={() => setChip(item.id)}
                  className={cn(
                    'min-h-11 justify-center rounded-full border px-4',
                    selected ? 'border-transparent bg-primary-soft' : 'border-line bg-bg',
                  )}
                >
                  <Text
                    className={cn(
                      'font-sans text-sm font-medium',
                      selected ? 'text-primary' : 'text-ink-soft',
                    )}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-surface"
        data={visible}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View className="ml-20 h-px bg-line" />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => router.push(chatHref(item.id))}
          />
        )}
        ListEmptyComponent={
          <Text className="px-4 py-8 text-center font-sans text-sm text-muted">No conversations</Text>
        }
      />
    </View>
  )
}
```

If `bg-primary-soft` is missing in Uniwind, use `bg-[#E8EDFB]` for selected chips. Do not use maroon or dark Messenger chips.

---

### Task 4: Wire the four routes

**Files:**
- Modify: `app/(contact)/messages.tsx`
- Modify: `app/(agent)/index.tsx`
- Modify: `app/(agent)/unassigned.tsx`
- Modify: `app/(admin)/conversations.tsx`

**Interfaces:**
- Consumes: `InboxScreen`, `listInboxConversations`, `CONVERSATIONS`, `DEV_ROLE`, `DEV_USER_ID`

- [ ] **Step 1: Contact messages**

```tsx
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, DEV_ROLE, DEV_USER_ID } from '@/lib/mock-data'

export default function ContactMessagesScreen() {
  const conversations = listInboxConversations(DEV_ROLE, DEV_USER_ID, CONVERSATIONS)

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose
      title="Messages"
    />
  )
}
```

When `DEV_ROLE !== 'contact'` this screen is unused. That is fine.

- [ ] **Step 2: Agent Chats**

```tsx
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, DEV_USER_ID } from '@/lib/mock-data'

export default function AgentChatsScreen() {
  const conversations = listInboxConversations('agent', DEV_USER_ID, CONVERSATIONS)

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose
      title="Messages"
    />
  )
}
```

Hard-code `'agent'` here (not `DEV_ROLE`) so the list rule stays correct even if someone opens the file while `DEV_ROLE` is admin. Unassigned pool must not appear.

- [ ] **Step 3: Agent Unassigned**

```tsx
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { CONVERSATIONS } from '@/lib/mock-data'

export default function AgentUnassignedScreen() {
  const conversations = CONVERSATIONS.filter((c) => c.assigneeId === null)

  return (
    <InboxScreen
      conversations={conversations}
      showChips={false}
      showCompose={false}
      title="Unassigned"
    />
  )
}
```

- [ ] **Step 4: Admin conversations**

```tsx
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { CONVERSATIONS } from '@/lib/mock-data'

export default function AdminConversationsScreen() {
  return (
    <InboxScreen
      conversations={CONVERSATIONS}
      showChips
      showCompose
      title="Messages"
    />
  )
}
```

- [ ] **Step 5: Tests + manual**

```powershell
pnpm test -- lib/inbox-filter.test.ts lib/conversation-title.test.ts lib/rbac.test.ts lib/display.test.ts
```

Expected: PASS.

Manual (`DEV_ROLE = 'contact'`): hub Messages → list with search, All/Open/Resolved, Offers megaphone row, unread pills, compose icon does nothing, tab bar still Home | Settings.

Manual (`DEV_ROLE = 'agent'`): Chats = Messages header, no `conv-unassigned`; Unassigned = that row only, no chips; tap row → `/chat/[id]` shell.

Manual (`DEV_ROLE = 'admin'`): Conversations tab shows all four threads including unassigned + offers. Users/Overview stay placeholders.

---

## Self-review

- Spec §6 chrome, row, title rule, chips, unread/online, Unassigned hide chips → Tasks 1–4.
- Spec §3.2 / 3.3 Agent Chats vs Unassigned vs Admin → Task 4.
- Contact inbox is a push (hidden tab), not a third tab — layout already correct; do not change `_layout` tab list.
- Compose dead — `onPress={() => undefined}`, no Alert.
- Modular: row ≠ screen ≠ filter. Routes thin.
- Testing: helpers have tests beside them. No app/ tests.
- State: query + chip `useState` on InboxScreen. No stores.
