import { useNavigation, useRouter } from "expo-router";
import {
  Building,
  CheckCheck,
  ChevronDown,
  CloudOff,
  Inbox,
  ListFilter,
  MessageCircle,
  SquarePen,
} from "@/components/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";

import { ConversationRow } from "@/components/inbox/conversation-row";
import { ManageInboxesSheet } from "@/components/inbox/manage-inboxes-sheet";
import { NewChatModal } from "@/components/inbox/new-chat-modal";
import { OrganizationFilterSheet } from "@/components/inbox/organization-filter-sheet";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { isConversationUnread } from "@/lib/conversation-list";
import {
  activeInboxChip,
  filterConversations,
  inboxChips,
  type InboxChip,
} from "@/lib/inbox-filter";
import { organizationPill, reachableSelection } from "@/lib/organization-filter";
import { useCustomInboxes } from "@/lib/use-custom-inboxes";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { settleEnter } from "@/lib/motion-enter";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { Conversation, UserRole } from "@/lib/types";
import Animated, { useReducedMotion } from "react-native-reanimated";

/**
 * The staff filters' labels. Which of them are offered, and in what order, is
 * `inboxChips` — Mine is not, in a Shared queue. The Unread toggle and the Org
 * pill sit among them, before Resolved, which the row keeps last.
 *
 * Short labels because the row is read at a glance: "All Messages" was
 * affordable beside two chips and is not beside five. It scrolls sideways when
 * a narrow phone cannot fit them.
 */
const CHIP_LABEL: Record<InboxChip, string> = {
  all: "All",
  mine: "Mine",
  open: "Open",
  resolved: "Resolved",
};

function keyExtractor(item: Conversation) {
  return item.id;
}

function InboxItemSeparator() {
  return <View className="h-3" />;
}

function InboxEmpty({
  showChips,
  caughtUp,
}: {
  showChips: boolean;
  /** Unread is on and nothing is: a good outcome, not a failed search. */
  caughtUp: boolean;
}) {
  const reduceMotion = useReducedMotion();
  if (caughtUp) {
    return (
      <Animated.View
        entering={settleEnter(!!reduceMotion)}
        className="items-center px-4 py-16"
      >
        <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
          <CheckCheck color={colors.primary} size={26} />
        </View>
        <Text variant="title" className="mt-4 text-ink">
          No unread conversations
        </Text>
        <Text variant="meta" className="mt-1 text-center text-muted">
          You have read everything here. Turn off Unread to see every conversation.
        </Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      className="items-center px-4 py-16"
    >
      <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
        {showChips ? (
          <MessageCircle color={colors.primary} size={26} />
        ) : (
          <Inbox color={colors.primary} size={26} />
        )}
      </View>
      <Text variant="title" className="mt-4 text-ink">
        {showChips ? "No conversations found" : "Unassigned pool is empty"}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {showChips
          ? "Try searching for a different person or changing the filter."
          : "All incoming requests have been assigned to an agent."}
      </Text>
    </Animated.View>
  );
}

/** One row-shaped placeholder, matching ConversationRow's layout so the list doesn't reflow when data lands. */
function InboxLoadingRow() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center gap-3.5 rounded-3xl border border-line/70 bg-surface p-4"
    >
      <View className="size-13 rounded-full bg-muted/15" />
      <View className="flex-1 gap-2">
        <View className="h-3.5 w-2/5 rounded-full bg-muted/15" />
        <View className="h-3 w-4/5 rounded-full bg-muted/10" />
      </View>
    </View>
  );
}

/** The first fetch, with nothing to show yet: row-shaped placeholders, not a bare spinner. */
function InboxLoading() {
  return (
    <View accessibilityLabel="Loading conversations" className="gap-3 px-4 pt-1">
      <InboxLoadingRow />
      <InboxLoadingRow />
      <InboxLoadingRow />
      <InboxLoadingRow />
    </View>
  );
}

/**
 * The list could not be fetched.
 *
 * Says what happened and offers the one thing that can help, rather than leaving
 * an empty list that reads as "you have no conversations" when the truth is that
 * nobody managed to ask.
 */
function InboxError({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      accessibilityLiveRegion="polite"
      className="items-center px-4 py-16"
    >
      <View className="size-14 items-center justify-center rounded-full bg-danger/10">
        <CloudOff color={colors.danger} size={26} />
      </View>
      <Text variant="title" className="mt-4 text-ink">
        {title}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {hint}
      </Text>
      {onRetry ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
        >
          <Text variant="label" className="font-bold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  );
}

type InboxScreenProps = {
  conversations: Conversation[];
  showChips: boolean;
  /**
   * Whether to offer the Unread toggle. Separate from `showChips` because a
   * Customer has no status chips and still has threads to catch up on. Off on
   * the pool, which is one queue rather than a list to narrow.
   */
  showUnreadFilter?: boolean;
  showCompose: boolean;
  title: string;
  /** Names a Customer's own support threads, which carry no title of their own. */
  organizationNames?: ReadonlyMap<string, string>;
  /** Who is looking, so the Mine chip knows whose threads to keep. */
  viewerId?: string;
  /**
   * Which role is reading, for the saved inboxes — a Customer has none and is
   * refused the endpoint. Absent on the pool, which is one queue and not a
   * place to filter by organization.
   */
  savedInboxesFor?: UserRole | null;
  /** Set while the first fetch is out and there is nothing to show yet. */
  loading?: boolean;
  /** What went wrong, when the list could not be fetched at all. */
  error?: { title: string; hint: string } | null;
  refreshing?: boolean;
  /** Absent for the lists still reading local data, which have nothing to refetch. */
  onRefresh?: () => void;
};

export function InboxScreen({
  conversations,
  showChips,
  showUnreadFilter = false,
  showCompose,
  title,
  organizationNames,
  viewerId,
  savedInboxesFor = null,
  loading = false,
  error = null,
  refreshing: refreshingProp,
  onRefresh: onRefreshProp,
}: InboxScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [selectedChip, setChip] = useState<InboxChip>("all");
  const supportAssignment = useSupportAssignment();
  const chips = inboxChips(supportAssignment);
  // A Mine left selected when assignment went off filters as All, and shows as it.
  const chip = activeInboxChip(selectedChip, supportAssignment);
  const [selectedUnreadOnly, setUnreadOnly] = useState(false);
  const unreadOnly = showUnreadFilter && selectedUnreadOnly;
  const [composeOpen, setComposeOpen] = useState(false);
  const [inboxesOpen, setInboxesOpen] = useState(false);
  const [organizationsOpen, setOrganizationsOpen] = useState(false);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  /*
   * A saved inbox is a set of organizations and nothing else, so it narrows
   * the rows already held rather than fetching a different list. Selecting
   * one therefore costs no request, and works with no signal.
   */
  const savedInboxes = useCustomInboxes(savedInboxesFor);
  /*
   * The Org pill offers the organizations a saved inbox may name: every one
   * for an Admin, an Agent's own. A pick that outlived a membership stops
   * narrowing rather than hiding rows behind an organization nobody can see.
   */
  const filterOrganizations = useMemo(
    () => (showChips && savedInboxesFor && savedInboxesFor !== "customer" ? savedInboxes.organizations : []),
    [showChips, savedInboxesFor, savedInboxes.organizations],
  );
  const pickedOrganizations = useMemo(
    () => reachableSelection(selectedOrganizations, filterOrganizations),
    [selectedOrganizations, filterOrganizations],
  );
  const pickedOrganizationIds = useMemo(
    () => (pickedOrganizations.length > 0 ? new Set(pickedOrganizations) : null),
    [pickedOrganizations],
  );
  const orgPill = organizationPill(filterOrganizations, pickedOrganizations);
  const [epoch, setEpoch] = useState(0);
  const simulated = useSimulatedRefresh(() => {
    setEpoch((n) => n + 1);
  });
  // A list that fetches refreshes for real; one still reading local data keeps
  // the gesture it had, which only replays the enter animation.
  const refreshing = onRefreshProp ? refreshingProp === true : simulated.refreshing;
  const onRefresh = onRefreshProp ?? simulated.onRefresh;

  useEffect(() => {
    navigation.setOptions({
      title,
      headerRight: showCompose
        ? () => (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="mr-2 size-10 items-center justify-center rounded-full bg-primary-soft/80"
              onPress={() => setComposeOpen(true)}
            >
              <SquarePen color={colors.primary} size={20} />
            </TactilePressable>
          )
        : undefined,
    });
  }, [navigation, showCompose, title]);

  const visible = useMemo(() => {
    void epoch;
    return filterConversations(conversations, {
      query,
      chip: showChips ? chip : "all",
      organizationNames,
      viewerId,
      organizationIds: savedInboxes.organizationIds,
      pickedOrganizationIds,
      unreadOnly,
    });
  }, [
    conversations,
    query,
    chip,
    showChips,
    organizationNames,
    viewerId,
    savedInboxes.organizationIds,
    pickedOrganizationIds,
    unreadOnly,
    epoch,
  ]);
  // How many of the rows the other filters leave are unread, so the toggle
  // says what turning it on would keep.
  const unreadTotal = useMemo(
    () => (unreadOnly ? visible.length : visible.filter(isConversationUnread).length),
    [unreadOnly, visible],
  );

  const renderChip = (id: InboxChip) => {
    const selected = id === chip;
    return (
      <TactilePressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={CHIP_LABEL[id]}
        accessibilityState={{ selected }}
        onPress={() => setChip(id)}
        className={cn(
          "min-h-9 justify-center rounded-full border px-3.5",
          selected
            ? "border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/25"
            : "border-line/80 bg-line/35",
        )}
      >
        <Text
          variant="label"
          className={selected ? "text-primary-foreground" : "text-ink-soft"}
        >
          {CHIP_LABEL[id]}
        </Text>
      </TactilePressable>
    );
  };

  /*
   * One organization is a pill named after it that a tap switches on and off;
   * several are "Org", which opens the list to pick from. It narrows whichever
   * chip is in force rather than being one, so it is drawn as a toggle (a
   * soft fill and a ring) rather than in the chips' solid selected fill.
   */
  const renderOrganizationPill = () => {
    if (orgPill.kind === "none") return null;
    const active = orgPill.active;
    const single = orgPill.kind === "single" ? orgPill.organization : null;
    return (
      <TactilePressable
        key="organizations"
        accessibilityRole="button"
        accessibilityLabel={
          single
            ? `Only ${single.name}`
            : active
              ? `Organizations, ${pickedOrganizations.length} selected`
              : "Organizations, none selected"
        }
        accessibilityState={single ? { selected: active } : { expanded: organizationsOpen }}
        onPress={() => {
          if (single) setSelectedOrganizations(active ? [] : [single.id]);
          else setOrganizationsOpen(true);
        }}
        className={cn(
          "min-h-9 max-w-48 flex-row items-center gap-1.5 rounded-full border px-3",
          active ? "border-primary/40 bg-primary-soft" : "border-line/80 bg-line/35",
        )}
      >
        <Building color={active ? colors.primary : colors.muted} size={14} />
        <Text
          variant="label"
          numberOfLines={1}
          className={cn("shrink", active ? "font-semibold text-primary" : "text-ink-soft")}
        >
          {single ? single.name : "Org"}
        </Text>
        {!single && active ? (
          <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
            <Text
              variant="label"
              className="text-[11px] font-semibold text-primary-foreground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {pickedOrganizations.length}
            </Text>
          </View>
        ) : null}
        {!single ? <ChevronDown color={active ? colors.primary : colors.muted} size={14} /> : null}
      </TactilePressable>
    );
  };

  /*
   * Unread narrows whichever chip is in force, like the Org pill, so it is
   * drawn the same way: a toggle with a soft fill and a ring when on. The
   * count is part of the accessible name, since a pressable collapses the
   * badge it contains.
   */
  const renderUnreadToggle = () => (
    <TactilePressable
      key="unread"
      accessibilityRole="button"
      accessibilityLabel={unreadTotal > 0 ? `Unread, ${unreadTotal}` : "Unread"}
      accessibilityState={{ selected: unreadOnly }}
      onPress={() => setUnreadOnly((on) => !on)}
      className={cn(
        "min-h-9 flex-row items-center gap-1.5 rounded-full border px-3",
        unreadOnly ? "border-primary/40 bg-primary-soft" : "border-line/80 bg-line/35",
      )}
    >
      <Text
        variant="label"
        className={unreadOnly ? "font-semibold text-primary" : "text-ink-soft"}
      >
        Unread
      </Text>
      {unreadTotal > 0 ? (
        <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
          <Text
            variant="label"
            className="text-[11px] font-semibold text-primary-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {unreadTotal > 99 ? "99+" : String(unreadTotal)}
          </Text>
        </View>
      ) : null}
    </TactilePressable>
  );

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push(chatHref(conversationId));
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        onPress={openConversation}
        organizationNames={organizationNames}
      />
    ),
    [openConversation, organizationNames],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations…"
          accessibilityLabel="Search conversations"
        />

        {savedInboxesFor && savedInboxesFor !== "customer" ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            {/*
              Nothing saved yet is one control rather than a row: an "All
              inboxes" chip that is the only chip narrows nothing and is
              selected against no alternative. What is worth offering there is
              the way to make the first one.
            */}
            {savedInboxes.inboxes.length > 0
              ? [null, ...savedInboxes.inboxes.map((inbox) => inbox.id)].map((id) => {
                  const inbox = savedInboxes.inboxes.find((row) => row.id === id);
                  const label = inbox?.name ?? "All inboxes";
                  const selected = savedInboxes.selectedId === id;
                  return (
                    <TactilePressable
                      key={id ?? "unified"}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                      onPress={() => savedInboxes.select(id)}
                      className={cn(
                        "min-h-9 justify-center rounded-xl border px-3",
                        selected
                          ? "border-primary/40 bg-primary-soft"
                          : "border-line/80 bg-line/35",
                      )}
                    >
                      <Text
                        variant="label"
                        className={
                          selected ? "font-semibold text-primary" : "text-ink-soft"
                        }
                      >
                        {label}
                      </Text>
                    </TactilePressable>
                  );
                })
              : null}
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Saved inboxes"
              onPress={() => setInboxesOpen(true)}
              className="min-h-9 flex-row items-center gap-1.5 justify-center rounded-xl border border-dashed border-line px-3"
            >
              <ListFilter color={colors.muted} size={16} />
              {savedInboxes.inboxes.length === 0 ? (
                <Text variant="label" className="text-muted">
                  Saved inboxes
                </Text>
              ) : null}
            </TactilePressable>
          </View>
        ) : null}

        {showChips || showUnreadFilter ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4 mt-3"
            contentContainerClassName="flex-row gap-2 px-4"
          >
            {showChips ? chips.filter((id) => id !== "resolved").map(renderChip) : null}
            {showUnreadFilter ? renderUnreadToggle() : null}
            {showChips ? renderOrganizationPill() : null}
            {showChips ? chips.filter((id) => id === "resolved").map(renderChip) : null}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={visible}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={InboxItemSeparator}
        renderItem={renderItem}
        ListEmptyComponent={
          loading ? (
            <InboxLoading />
          ) : error ? (
            <InboxError title={error.title} hint={error.hint} onRetry={onRefresh} />
          ) : (
            <InboxEmpty showChips={showChips} caughtUp={unreadOnly && !query.trim()} />
          )
        }
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />

      <ManageInboxesSheet
        visible={inboxesOpen}
        onClose={() => setInboxesOpen(false)}
        view={savedInboxes}
      />

      <OrganizationFilterSheet
        visible={organizationsOpen}
        onClose={() => setOrganizationsOpen(false)}
        organizations={filterOrganizations}
        selected={pickedOrganizations}
        onChange={setSelectedOrganizations}
      />

      <NewChatModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onOpenConversation={(conversationId) => router.push(chatHref(conversationId))}
      />
    </View>
  );
}
