import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import { BroadcastBadges, BroadcastDetailSheet } from "@/components/hub/broadcast-detail-sheet";
import { BroadcastComposeSheet } from "@/components/hub/broadcast-compose-sheet";
import { Megaphone, Plus } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { BROADCAST_PAGE_SIZE, listBroadcasts } from "@/lib/broadcast-api";
import { can } from "@/lib/capabilities";
import { failureNotice } from "@/lib/conversation-failure";
import { formatRelativeTime } from "@/lib/display";
import { colors } from "@/lib/tokens";
import { useViewer } from "@/lib/use-viewer";
import type { Broadcast } from "@/lib/types";

/**
 * Sent Broadcasts, newest first, and the way to send one.
 *
 * An Admin sees every Broadcast anyone sent. Sending is drawn only for a viewer
 * holding `send_broadcasts`, and the acknowledgement report only for one holding
 * `view_acknowledgements`: the API refuses both otherwise.
 */

type HistoryState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; rows: Broadcast[]; more: boolean };

function keyExtractor(item: Broadcast) {
  return item.id;
}

export function BroadcastsScreen() {
  const viewer = useViewer();
  const canSend = can(viewer, "send_broadcasts");
  const canViewAcknowledgements = can(viewer, "view_acknowledgements");

  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<Broadcast | null>(null);
  /** Which read the answer belongs to, so a refresh mid-flight wins. */
  const generation = useRef(0);

  const loadFirst = useCallback(() => {
    const mine = (generation.current += 1);
    void listBroadcasts().then((result) => {
      if (generation.current !== mine) return;
      setRefreshing(false);
      if (!result.ok) {
        const notice = failureNotice(result.failure, "Could not load broadcasts");
        setState({ status: "failed", title: notice.title, hint: notice.hint });
        return;
      }
      setState({
        status: "ready",
        rows: result.value,
        more: result.value.length === BROADCAST_PAGE_SIZE,
      });
    });
  }, []);

  useEffect(() => loadFirst(), [loadFirst]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    loadFirst();
  }, [loadFirst]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.more || loadingMore) return;
    const last = state.rows[state.rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const mine = generation.current;
    void listBroadcasts({ cursor: last.id }).then((result) => {
      setLoadingMore(false);
      if (generation.current !== mine || !result.ok) return;
      setState((held) =>
        held.status === "ready"
          ? {
              status: "ready",
              rows: [...held.rows, ...result.value.filter((row) => !held.rows.some((h) => h.id === row.id))],
              more: result.value.length === BROADCAST_PAGE_SIZE,
            }
          : held,
      );
    });
  }, [loadingMore, state]);

  const sent = useCallback((broadcast: Broadcast) => {
    setState((held) =>
      held.status === "ready"
        ? { ...held, rows: [broadcast, ...held.rows] }
        : { status: "ready", rows: [broadcast], more: false },
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Broadcast }) => (
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, sent ${formatRelativeTime(item.sentAt)}`}
        onPress={() => setOpen(item)}
        className="gap-1.5 rounded-2xl border border-line/70 bg-surface p-3.5"
      >
        <View className="flex-row items-start justify-between gap-2">
          <Text variant="label" numberOfLines={2} className="min-w-0 flex-1 font-semibold text-ink">
            {item.title}
          </Text>
          <Text variant="label" className="font-normal text-muted">
            {formatRelativeTime(item.sentAt)}
          </Text>
        </View>
        <BroadcastBadges broadcast={item} />
        <Text variant="meta" numberOfLines={2} className="text-muted">
          {item.body}
        </Text>
        <Text variant="label" className="font-normal text-ink-soft">
          {item.recipientCount} {item.recipientCount === 1 ? "recipient" : "recipients"}
          {item.requiresAcknowledgement
            ? ` · ${item.acknowledgedCount} of ${item.recipientCount} acknowledged`
            : ""}
          {` · ${item.createdByName ?? "System"}`}
        </Text>
      </TactilePressable>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-bg">
      {canSend ? (
        <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-3">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="New broadcast"
            onPress={() => setComposing(true)}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary"
          >
            <Plus color={colors.primaryForeground} size={18} />
            <Text variant="label" className="font-semibold text-primary-foreground">
              New broadcast
            </Text>
          </TactilePressable>
        </View>
      ) : null}

      <FlatList
        className="flex-1 bg-bg"
        data={state.status === "ready" ? state.rows : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerClassName="gap-2.5 px-4 py-3"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : undefined}
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
          ) : (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Megaphone color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-center text-ink">
                No broadcasts yet
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {canSend
                  ? "Send an announcement to organizations, communities or groups."
                  : "Announcements the team sends will be listed here."}
              </Text>
            </View>
          )
        }
      />

      <BroadcastComposeSheet visible={composing} onClose={() => setComposing(false)} onSent={sent} />
      <BroadcastDetailSheet
        broadcast={open}
        canViewAcknowledgements={canViewAcknowledgements}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}
