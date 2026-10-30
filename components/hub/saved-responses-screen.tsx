import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Switch,
  View,
} from "react-native";

import {
  Archive,
  Building,
  MessageSquare,
  Plus,
  RotateCcw,
  Trash2,
  User,
} from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { PromoteSavedResponseSheet } from "@/components/hub/promote-saved-response-sheet";
import { SavedResponseSheet } from "@/components/hub/saved-response-sheet";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import {
  deleteCannedReply,
  listCannedReplies,
  updateCannedReply,
} from "@/lib/canned-reply-api";
import {
  cannedReplyEmptyState,
  sortCannedReplies,
  usageLabel,
  visibleCannedReplies,
} from "@/lib/canned-reply-library";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { listOrganizations } from "@/lib/org-api";
import { colors } from "@/lib/tokens";
import type { CannedReply, OrganizationSummary } from "@/lib/types";

/**
 * The saved responses agents insert from the composer.
 *
 * Admin only (it lives under the Admin Hub). Organization responses are scoped
 * per organization: each names one company's policies, hours and prices, so the
 * organization it belongs to is chosen at creation and never changes. Every
 * staff member's personal responses are listed too, with whose they are, so an
 * Admin can find good wording and share it with an organization. Most used
 * first, as the API sends them.
 *
 * The whole library is held, archived rows included, and narrowed on this
 * device. That keeps the archived switch and the search free of requests, and
 * it is what lets the empty state say "everything here is archived" instead of
 * "nothing saved yet" when those are not the same fact.
 */

type LibraryState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; replies: CannedReply[] };

type SheetState = { reply: CannedReply | null } | null;

function keyExtractor(item: CannedReply) {
  return item.id;
}

export function SavedResponsesScreen() {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  /** Null is every organization the Admin can reach. */
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [promoting, setPromoting] = useState<CannedReply | null>(null);
  /** Which response has a write out for it, so its row can say it is working. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    void listCannedReplies({
      organizationId: organizationId ?? undefined,
      includeArchived: true,
    }).then((result) => {
      if (result.ok) {
        setState({ status: "ready", replies: result.value });
        return;
      }
      const notice = failureNotice(result.failure, "Could not load saved responses");
      setState({ status: "failed", title: notice.title, hint: notice.hint });
    });
  }, [organizationId]);

  useEffect(() => load(), [load]);

  /**
   * The spinner is set by whatever asked for a reload rather than by `load`,
   * so the effect that runs it sets no state of its own before the answer.
   */
  const retry = useCallback(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  const pickOrganization = useCallback(
    (id: string | null) => {
      if (id === organizationId) return;
      setState({ status: "loading" });
      setOrganizationId(id);
    },
    [organizationId],
  );

  // The names for the badges and the picker. A failure here leaves the chips
  // out rather than failing the screen: the library still reads without them.
  useEffect(() => {
    void listOrganizations().then((result) => {
      if (result.ok) setOrganizations(result.value);
    });
  }, []);

  const organizationNames = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );

  const library = useMemo(
    () => (state.status === "ready" ? state.replies : []),
    [state],
  );
  const rows = useMemo(
    () => visibleCannedReplies(library, { showArchived, search }),
    [library, search, showArchived],
  );
  const empty = cannedReplyEmptyState(library, {
    showArchived,
    search,
    organizationName: organizationId ? (organizationNames.get(organizationId) ?? null) : null,
  });

  /** One response, replaced in place: every write here answers with the row it changed. */
  const replace = useCallback((reply: CannedReply) => {
    setState((held) => {
      if (held.status !== "ready") return { status: "ready", replies: [reply] };
      const known = held.replies.some((row) => row.id === reply.id);
      const replies = known
        ? held.replies.map((row) => (row.id === reply.id ? reply : row))
        : [...held.replies, reply];
      // The API sorts most used first; a new or changed row goes where a refetch would put it.
      return { status: "ready", replies: sortCannedReplies(replies) };
    });
  }, []);

  /**
   * A row created in another organization than the filter's belongs to a list
   * not on screen. A personal one is the Admin's own, which every list includes.
   */
  const saved = useCallback(
    (reply: CannedReply) => {
      if (organizationId && reply.organizationId && reply.organizationId !== organizationId) return;
      replace(reply);
    },
    [organizationId, replace],
  );

  const remove = useCallback((id: string) => {
    setState((held) =>
      held.status === "ready"
        ? { status: "ready", replies: held.replies.filter((row) => row.id !== id) }
        : held,
    );
  }, []);

  const setArchived = useCallback(
    (reply: CannedReply, archived: boolean) => {
      setBusyId(reply.id);
      setProblem(null);
      void updateCannedReply(reply.id, { archived }).then((result) => {
        setBusyId(null);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not update the response").hint);
          return;
        }
        replace(result.value);
      });
    },
    [replace],
  );

  const confirmArchive = useCallback(
    (reply: CannedReply) => {
      Alert.alert(
        `Archive “${reply.title}”?`,
        "Agents stop seeing it in the composer. You can restore it later.",
        [
          { text: "Keep", style: "cancel" },
          { text: "Archive", onPress: () => setArchived(reply, true) },
        ],
      );
    },
    [setArchived],
  );

  const confirmDelete = useCallback(
    (reply: CannedReply) => {
      Alert.alert(
        `Delete “${reply.title}”?`,
        "It is gone for every agent and cannot be restored. To hide it without losing the text, archive it instead.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setBusyId(reply.id);
              setProblem(null);
              void deleteCannedReply(reply.id).then((result) => {
                setBusyId(null);
                if (!result.ok) {
                  setProblem(failureNotice(result.failure, "Could not delete the response").hint);
                  return;
                }
                remove(reply.id);
              });
            },
          },
        ],
      );
    },
    [remove],
  );

  const renderItem = useCallback(
    ({ item }: { item: CannedReply }) => {
      const busy = busyId === item.id;
      const organizationName =
        organizationId || !item.organizationId ? null : organizationNames.get(item.organizationId);
      const personal = item.scope === "personal";
      return (
        <View
          className={cn(
            "flex-row items-start gap-2 rounded-2xl border border-line/70 bg-surface p-3.5",
            item.archived && "opacity-60",
          )}
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.title}`}
            onPress={() => setSheet({ reply: item })}
            className="min-w-0 flex-1 gap-1"
          >
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text variant="label" className="shrink font-semibold text-ink" numberOfLines={1}>
                {item.title}
              </Text>
              {personal ? (
                <View className="flex-row items-center gap-1 rounded-full bg-line/70 px-2 py-0.5">
                  <User color={colors.muted} size={11} />
                  <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
                    Personal · {item.owner?.name ?? "Former staff"}
                  </Text>
                </View>
              ) : organizationName ? (
                <View className="rounded-full bg-primary-soft px-2 py-0.5">
                  <Text variant="label" className="font-normal text-primary">
                    {organizationName}
                  </Text>
                </View>
              ) : null}
              {item.archived ? (
                <View className="rounded-full border border-line/80 px-2 py-0.5">
                  <Text variant="label" className="font-normal text-muted">
                    Archived
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Three lines, line breaks kept: the shape is part of what was saved. */}
            <Text variant="meta" className="text-muted" numberOfLines={3}>
              {item.body}
            </Text>
            <Text
              variant="label"
              className="font-normal text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {usageLabel(item.useCount)}
            </Text>
          </TactilePressable>

          {busy ? (
            <View className="size-11 items-center justify-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="flex-row">
              {personal ? (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${item.title} with an organization`}
                  onPress={() => setPromoting(item)}
                  className="size-11 items-center justify-center rounded-full"
                >
                  <Building color={colors.primary} size={18} />
                </TactilePressable>
              ) : null}
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={
                  item.archived ? `Restore ${item.title}` : `Archive ${item.title}`
                }
                onPress={() => (item.archived ? setArchived(item, false) : confirmArchive(item))}
                className="size-11 items-center justify-center rounded-full"
              >
                {item.archived ? (
                  <RotateCcw color={colors.primary} size={18} />
                ) : (
                  <Archive color={colors.muted} size={18} />
                )}
              </TactilePressable>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
                onPress={() => confirmDelete(item)}
                className="size-11 items-center justify-center rounded-full"
              >
                <Trash2 color={colors.danger} size={18} />
              </TactilePressable>
            </View>
          )}
        </View>
      );
    },
    [busyId, confirmArchive, confirmDelete, organizationId, organizationNames, setArchived],
  );

  const filterChips = [
    { id: null, name: "All" },
    ...organizations.map((organization) => ({ id: organization.id, name: organization.name })),
  ];

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-3 border-b border-line/60 bg-surface px-4 pb-3.5 pt-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <SearchFieldWithClear
              value={search}
              onChangeText={setSearch}
              placeholder="Search titles and text…"
              accessibilityLabel="Search saved responses"
            />
          </View>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="New saved response"
            onPress={() => setSheet({ reply: null })}
            className="size-11 items-center justify-center rounded-2xl bg-primary"
          >
            <Plus color={colors.primaryForeground} size={20} />
          </TactilePressable>
        </View>

        {organizations.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {filterChips.map((chip) => {
              const selected = chip.id === organizationId;
              return (
                <TactilePressable
                  key={chip.id ?? "all"}
                  accessibilityRole="radio"
                  accessibilityLabel={chip.id ? chip.name : "All organizations"}
                  accessibilityState={{ checked: selected }}
                  onPress={() => pickOrganization(chip.id)}
                  className={cn(
                    "min-h-9 justify-center rounded-full border px-3.5",
                    selected
                      ? "border-transparent bg-primary"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={selected ? "text-primary-foreground" : "text-ink-soft"}
                  >
                    {chip.name}
                  </Text>
                </TactilePressable>
              );
            })}
          </ScrollView>
        ) : null}

        <TactilePressable
          accessibilityRole="switch"
          accessibilityLabel="Show archived"
          accessibilityState={{ checked: showArchived }}
          onPress={() => setShowArchived((value) => !value)}
          className="min-h-11 flex-row items-center justify-between"
        >
          <Text variant="label" className="text-ink-soft">
            Show archived
          </Text>
          {/* The row is the control; the switch is its picture of the state. */}
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Switch
              value={showArchived}
              trackColor={{ false: colors.line, true: colors.primary }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.line}
            />
          </View>
        </TactilePressable>

        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
            {problem}
          </Text>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={rows}
        keyExtractor={keyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 py-3"
        renderItem={renderItem}
        ListEmptyComponent={
          state.status === "loading" ? (
            <View className="py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : state.status === "failed" ? (
            <View className="items-center px-4 py-12">
              <Text variant="title" className="text-ink">
                {state.title}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {state.hint}
              </Text>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={retry}
                className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
              >
                <Text variant="label" className="font-semibold text-primary-foreground">
                  Try again
                </Text>
              </TactilePressable>
            </View>
          ) : empty.kind === "none" ? undefined : (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <MessageSquare color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-center text-ink">
                {empty.title}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {empty.hint}
              </Text>
              {empty.kind === "no-match" ? null : (
                <View className="mt-4 flex-row flex-wrap justify-center gap-2">
                  {empty.kind === "archived-hidden" ? (
                    <TactilePressable
                      accessibilityRole="button"
                      accessibilityLabel="Show archived"
                      onPress={() => setShowArchived(true)}
                      className="min-h-11 justify-center rounded-full border border-line/80 bg-surface px-5"
                    >
                      <Text variant="label" className="font-semibold text-ink">
                        Show archived
                      </Text>
                    </TactilePressable>
                  ) : null}
                  <TactilePressable
                    accessibilityRole="button"
                    accessibilityLabel="New saved response"
                    onPress={() => setSheet({ reply: null })}
                    className="min-h-11 justify-center rounded-full bg-primary px-5"
                  >
                    <Text variant="label" className="font-semibold text-primary-foreground">
                      New saved response
                    </Text>
                  </TactilePressable>
                </View>
              )}
            </View>
          )
        }
      />

      <SavedResponseSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        reply={sheet?.reply ?? null}
        organizations={organizations}
        defaultOrganizationId={organizationId}
        onSaved={saved}
      />

      <PromoteSavedResponseSheet
        reply={promoting}
        organizations={organizations}
        onClose={() => setPromoting(null)}
        onPromoted={replace}
      />
    </View>
  );
}
