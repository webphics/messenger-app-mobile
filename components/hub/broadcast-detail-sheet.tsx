import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { X } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import {
  ACKNOWLEDGEMENT_PAGE_SIZE,
  listAcknowledgements,
  type AcknowledgementFilter,
} from "@/lib/broadcast-api";
import { audienceSummary } from "@/lib/broadcast-draft";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { formatRelativeTime } from "@/lib/display";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Broadcast, BroadcastAcknowledgement } from "@/lib/types";

/**
 * One sent Broadcast: what it said, who it went to, and, for one that asked for
 * acknowledgement and a viewer holding `view_acknowledgements`, who has
 * confirmed. The recipients were fixed when it was sent.
 */

type DetailSheetProps = {
  broadcast: Broadcast | null;
  canViewAcknowledgements: boolean;
  onClose: () => void;
};

export function BroadcastDetailSheet({ broadcast, canViewAcknowledgements, onClose }: DetailSheetProps) {
  return (
    <Modal
      visible={broadcast !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        {broadcast ? (
          <Detail
            key={broadcast.id}
            broadcast={broadcast}
            canViewAcknowledgements={canViewAcknowledgements}
            onClose={onClose}
          />
        ) : null}
      </SafeAreaProvider>
    </Modal>
  );
}

export function BroadcastBadges({ broadcast }: { broadcast: Broadcast }) {
  if (!broadcast.essential && !broadcast.requiresAcknowledgement) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {broadcast.essential ? (
        <View className="rounded-full bg-danger/10 px-2 py-0.5">
          <Text variant="label" className="font-normal text-danger">
            Essential
          </Text>
        </View>
      ) : null}
      {broadcast.requiresAcknowledgement ? (
        <View className="rounded-full bg-primary-soft px-2 py-0.5">
          <Text variant="label" className="font-normal text-primary">
            Acknowledgement required
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Detail({ broadcast, canViewAcknowledgements, onClose }: Omit<DetailSheetProps, "broadcast"> & { broadcast: Broadcast }) {
  const insets = useSafeAreaInsets();
  const showsReport = broadcast.requiresAcknowledgement && canViewAcknowledgements;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}>
      <View className="flex-row items-center justify-between gap-3 border-b border-line/60 bg-surface px-4 pb-3">
        <Text variant="headline" numberOfLines={2} className="min-w-0 flex-1 text-ink">
          {broadcast.title}
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
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: screenBottomPad(insets.bottom, 24) }}
      >
        <BroadcastBadges broadcast={broadcast} />
        <Text variant="body" className="text-ink" selectable>
          {broadcast.body}
        </Text>

        <View className="gap-1.5 rounded-2xl border border-line/70 bg-surface p-3.5">
          <Fact label="Sent" value={`${formatRelativeTime(broadcast.sentAt)} by ${broadcast.createdByName ?? "System"}`} />
          <Fact label="Audience" value={audienceSummary(broadcast.audience)} />
          <Fact
            label="Recipients"
            value={`${broadcast.recipientCount} ${broadcast.recipientCount === 1 ? "person" : "people"}`}
          />
          {broadcast.requiresAcknowledgement ? (
            <Fact
              label="Acknowledged"
              value={`${broadcast.acknowledgedCount} of ${broadcast.recipientCount}`}
            />
          ) : null}
          <Text variant="label" className="mt-1 font-normal text-muted">
            Recipients were fixed when it was sent. People who join later don’t receive it.
          </Text>
        </View>

        {showsReport ? <AcknowledgementReport broadcastId={broadcast.id} /> : null}
      </ScrollView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text variant="label" className="w-28 text-muted">
        {label}
      </Text>
      <Text variant="label" className="min-w-0 flex-1 font-normal text-ink">
        {value}
      </Text>
    </View>
  );
}

type ReportState =
  | { status: "loading" }
  | { status: "failed"; hint: string }
  | { status: "ready"; rows: BroadcastAcknowledgement[]; done: boolean; more: boolean };

function AcknowledgementReport({ broadcastId }: { broadcastId: string }) {
  const [filter, setFilter] = useState<AcknowledgementFilter>("pending");
  const [state, setState] = useState<ReportState>({ status: "loading" });

  const load = useCallback(
    (offset: number, held: BroadcastAcknowledgement[]) => {
      void listAcknowledgements(broadcastId, { offset, status: filter }).then((result) => {
        if (!result.ok) {
          setState({ status: "failed", hint: failureNotice(result.failure, "Could not load acknowledgements").hint });
          return;
        }
        const page = result.value.recipients;
        setState({
          status: "ready",
          rows: [...held, ...page],
          done: true,
          more: page.length === ACKNOWLEDGEMENT_PAGE_SIZE,
        });
      });
    },
    [broadcastId, filter],
  );

  useEffect(() => load(0, []), [load]);

  const pick = (next: AcknowledgementFilter) => {
    if (next === filter) return;
    setState({ status: "loading" });
    setFilter(next);
  };

  return (
    <View className="gap-3">
      <Text variant="label" className="uppercase tracking-wide text-muted">
        Acknowledgements
      </Text>
      <View className="flex-row gap-2">
        {(["pending", "acknowledged"] as const).map((option) => {
          const on = option === filter;
          return (
            <TactilePressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={option === "pending" ? "Outstanding" : "Acknowledged"}
              onPress={() => pick(option)}
              className={cn(
                "min-h-9 justify-center rounded-full border px-3.5",
                on ? "border-transparent bg-primary" : "border-line/80 bg-line/35",
              )}
            >
              <Text variant="label" className={on ? "text-primary-foreground" : "text-ink-soft"}>
                {option === "pending" ? "Outstanding" : "Acknowledged"}
              </Text>
            </TactilePressable>
          );
        })}
      </View>

      {state.status === "loading" ? (
        <ActivityIndicator color={colors.primary} />
      ) : state.status === "failed" ? (
        <View className="gap-2">
          <Text variant="meta" className="text-danger">
            {state.hint}
          </Text>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => {
              setState({ status: "loading" });
              load(0, []);
            }}
            className="min-h-11 self-start justify-center rounded-full border border-line/80 bg-surface px-4"
          >
            <Text variant="label" className="font-semibold text-ink">
              Try again
            </Text>
          </TactilePressable>
        </View>
      ) : state.rows.length === 0 ? (
        <Text variant="meta" className="text-muted">
          {filter === "pending" ? "Everyone has acknowledged it." : "Nobody has acknowledged it yet."}
        </Text>
      ) : (
        <View className="gap-1.5">
          {state.rows.map((row) => (
            <View
              key={row.userId}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-line/60 bg-surface px-3 py-2.5"
            >
              <Text variant="label" numberOfLines={1} className="min-w-0 flex-1 text-ink">
                {row.name ?? "Deleted account"}
              </Text>
              <Text variant="label" className="font-normal text-muted">
                {row.acknowledgedAt ? formatRelativeTime(row.acknowledgedAt) : "Not yet"}
              </Text>
            </View>
          ))}
          {state.more ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Show more"
              onPress={() => load(state.rows.length, state.rows)}
              className="min-h-11 items-center justify-center"
            >
              <Text variant="label" className="font-semibold text-primary">
                Show more
              </Text>
            </TactilePressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
