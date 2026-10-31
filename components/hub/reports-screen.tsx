import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";

import { Flag } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { refusalSentence } from "@/lib/api-result";
import { cn } from "@/lib/cn";
import type { AdminReport, ReportAction, ReportStatus } from "@/lib/report-parse";
import {
  REPORT_ACTION_COPY,
  REPORT_ACTION_DONE,
  REPORT_TABS,
  REPORT_TARGET_LABELS,
  isReportOverdue,
  reportAge,
} from "@/lib/report-queue";
import { REPORT_REASON_COPY } from "@/lib/report-reasons";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { useReportQueue } from "@/lib/use-report-queue";

/**
 * The Admin's report queue: what people reported, oldest open first, and the
 * three things an Admin can do about each — take the content down, ban whoever
 * posted it, or dismiss the report.
 *
 * App Review expects action within a day, so an open report past
 * `REPORT_RESPONSE_HOURS` says *Overdue* in words at the top of its card, not
 * only in colour. Every action asks first; the API is what decides which of
 * the three a report offers (`availableActions`), so a button here never opens
 * onto a refusal.
 */

function keyExtractor(item: AdminReport) {
  return item.id;
}

function Separator() {
  return <View className="h-3" />;
}

export function ReportsScreen() {
  const [tab, setTab] = useState<ReportStatus>("open");
  const queue = useReportQueue(tab);
  // The clock the rows were read on rather than this render's: a pull or an
  // action re-reads them, and the ages move with it.
  const now = queue.readAt;

  const act = useCallback(
    (report: AdminReport, action: ReportAction) => {
      const copy = REPORT_ACTION_COPY[action];
      Alert.alert(copy.title, copy.body, [
        { text: "Cancel", style: "cancel" },
        {
          text: copy.confirm,
          style: copy.destructive ? "destructive" : "default",
          onPress: () => {
            void queue.resolve(report, action).then((result) => {
              if (result.ok) return;
              const sentence = refusalSentence(result.failure, "That could not be saved.");
              if (sentence) Alert.alert("Could not act on the report", sentence);
            });
          },
        },
      ]);
    },
    [queue],
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminReport }) => (
      <ReportCard report={item} now={now} busy={queue.busy.has(item.id)} onAct={act} />
    ),
    [act, now, queue.busy],
  );

  return (
    <View className="flex-1 bg-bg">
      <View
        accessibilityRole="tablist"
        className="flex-row gap-2 border-b border-line/60 bg-surface px-4 pb-3.5 pt-2"
      >
        {REPORT_TABS.map((option) => {
          const selected = option.status === tab;
          return (
            <TactilePressable
              key={option.status}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} reports`}
              onPress={() => setTab(option.status)}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-full border",
                selected ? "border-primary bg-primary" : "border-line/80 bg-surface",
              )}
            >
              <Text
                variant="label"
                className={selected ? "text-primary-foreground" : "text-ink"}
              >
                {option.label}
              </Text>
            </TactilePressable>
          );
        })}
      </View>

      {queue.loading ? (
        <View accessibilityLabel="Loading reports" className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          className="flex-1 bg-bg"
          data={queue.rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          contentContainerClassName="grow px-4 py-3"
          showsVerticalScrollIndicator={false}
          onEndReached={queue.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={makeRefreshControl(queue.refreshing, queue.refresh)}
          ListHeaderComponent={
            queue.failure ? (
              <View accessibilityLiveRegion="polite" className="mb-3 gap-2 rounded-2xl bg-danger/10 p-3.5">
                <Text variant="meta" className="text-danger">
                  {queue.failure}
                </Text>
                <Button variant="outline" size="sm" className="self-start" onPress={queue.refresh}>
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            queue.failure ? undefined : (
              <View className="flex-1 items-center justify-center gap-2 px-6 py-16">
                <Flag color={colors.muted} size={28} />
                <Text variant="title" className="text-center text-ink">
                  {tab === "open" ? "Nothing waiting for review" : `No ${tab} reports`}
                </Text>
                <Text variant="meta" className="text-center text-muted">
                  {tab === "open"
                    ? "Reports people make about posts, messages and groups appear here."
                    : "Reports move here once somebody acts on them."}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            queue.loadingMore ? (
              <View className="items-center py-5">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const ReportCard = memo(function ReportCard({
  report,
  now,
  busy,
  onAct,
}: {
  report: AdminReport;
  now: number;
  busy: boolean;
  onAct: (report: AdminReport, action: ReportAction) => void;
}) {
  const overdue = isReportOverdue(report, now);
  const reason = REPORT_REASON_COPY[report.reason].label;
  const target = REPORT_TARGET_LABELS[report.targetKind];
  const snapshot = report.content.text;
  const files = report.content.attachmentCount;

  return (
    <View
      className={cn(
        "gap-3 rounded-3xl border bg-surface p-4 shadow-md shadow-black/8",
        overdue ? "border-danger/60" : "border-line/70",
      )}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {overdue ? (
            <View className="rounded-full bg-danger px-2.5 py-0.5">
              <Text variant="label" className="text-primary-foreground">
                Overdue
              </Text>
            </View>
          ) : null}
          <Text variant="label" numberOfLines={1} className="min-w-0 shrink uppercase tracking-wider text-muted">
            {target} · {report.reference}
          </Text>
        </View>
        <Text variant="meta" className={cn("tabular-nums", overdue ? "text-danger" : "text-muted")}>
          {reportAge(report.createdAt, now)}
        </Text>
      </View>

      <View className="gap-1">
        <Text variant="title" className="text-ink">
          {reason}
        </Text>
        {report.details ? (
          <Text variant="body" className="text-ink-soft">
            “{report.details}”
          </Text>
        ) : null}
      </View>

      <View className="gap-1 rounded-2xl bg-bg p-3">
        <Text variant="label" className="text-muted">
          {report.content.removed ? "Reported content · removed" : "Reported content"}
        </Text>
        <Text variant="body" numberOfLines={6} className="text-ink">
          {snapshot ?? (files > 0 ? "No text" : "Nothing was captured")}
        </Text>
        {files > 0 ? (
          <Text variant="meta" className="text-muted">
            {files === 1 ? "1 attachment" : `${files} attachments`}
          </Text>
        ) : null}
      </View>

      <View className="gap-0.5">
        <Text variant="meta" className="text-muted">
          Posted by {report.reportedUser ? report.reportedUser.name : "an account that has gone"}
          {report.reportedUser?.email ? ` (${report.reportedUser.email})` : ""}
        </Text>
        <Text variant="meta" className="text-muted">
          Reported by {report.reporter ? report.reporter.name : "an account that has gone"}
        </Text>
        {report.action ? (
          <Text variant="meta" className="text-muted">
            {REPORT_ACTION_DONE[report.action]}
            {report.handledBy ? ` by ${report.handledBy.name}` : ""}
          </Text>
        ) : null}
      </View>

      {report.availableActions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {report.availableActions.map((action) => {
            const copy = REPORT_ACTION_COPY[action];
            return (
              <Button
                key={action}
                size="sm"
                variant={copy.destructive ? "destructive" : "outline"}
                disabled={busy}
                accessibilityState={{ disabled: busy, busy }}
                accessibilityLabel={`${copy.label}, ${reason}, ${report.reference}`}
                onPress={() => onAct(report, action)}
              >
                <Text>{copy.label}</Text>
              </Button>
            );
          })}
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
      ) : null}
    </View>
  );
});
