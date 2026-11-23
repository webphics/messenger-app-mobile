import { router, type Href } from "expo-router";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { Bug, MessageSquare, Paperclip } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import type { AdminFeedback } from "@/lib/feedback-parse";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_KIND_FILTERS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TABS,
  formatAverageRating,
  isFeedbackClosed,
  type FeedbackKindFilter,
  type FeedbackTab,
} from "@/lib/feedback-rules";
import { reportAge } from "@/lib/report-queue";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { useFeedbackInbox, useFeedbackSummary } from "@/lib/use-feedback-triage";

/**
 * The super admin's inbox of bug reports and feedback, the web's
 * `/feedback/triage` on a phone: Open or Closed, narrowed to one kind or not,
 * newest first. A tap opens the entry, which is where it is triaged.
 *
 * Only the super admin reaches this (`SCREEN_ACCESS.feedback`), because only
 * the super admin's requests are answered.
 */

export function feedbackEntryHref(id: string): Href {
  return { pathname: "/(admin)/(home)/feedback-entry/[id]", params: { id } } as unknown as Href;
}

function keyExtractor(item: AdminFeedback) {
  return item.id;
}

function Separator() {
  return <View className="h-3" />;
}

function Segment<T extends string>({
  options,
  value,
  onChange,
  noun,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  noun: string;
}) {
  return (
    <View accessibilityRole="tablist" className="flex-row gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TactilePressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} ${noun}`}
            onPress={() => onChange(option.value)}
            className={cn(
              "min-h-11 flex-1 items-center justify-center rounded-full border",
              selected ? "border-primary bg-primary" : "border-line/80 bg-surface",
            )}
          >
            <Text variant="label" className={selected ? "text-primary-foreground" : "text-ink"}>
              {option.label}
            </Text>
          </TactilePressable>
        );
      })}
    </View>
  );
}

const TAB_OPTIONS = FEEDBACK_TABS.map((tab) => ({ value: tab.state, label: tab.label }));
const KIND_OPTIONS = FEEDBACK_KIND_FILTERS.map((filter) => ({ value: filter.kind, label: filter.label }));

export function FeedbackTriageScreen() {
  const [tab, setTab] = useState<FeedbackTab>("open");
  const [kind, setKind] = useState<FeedbackKindFilter>("all");
  const inbox = useFeedbackInbox(tab, kind);
  const summary = useFeedbackSummary(true);
  // Ages are judged on the clock of this render; a pull re-reads and re-renders.
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setNow(Date.now());
    inbox.refresh();
  }, [inbox]);

  const renderItem = useCallback(
    ({ item }: { item: AdminFeedback }) => <FeedbackCard entry={item} now={now} />,
    [now],
  );

  const average = formatAverageRating(summary?.feedback.averageRating ?? null);

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-2.5 border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <Segment options={TAB_OPTIONS} value={tab} onChange={setTab} noun="entries" />
        <Segment options={KIND_OPTIONS} value={kind} onChange={setKind} noun="kinds" />
        {summary ? (
          <Text variant="meta" className="tabular-nums text-muted" accessibilityLiveRegion="polite">
            {summary.bugReports.open} open bug{summary.bugReports.open === 1 ? "" : "s"}
            {summary.bugReports.critical > 0 ? ` (${summary.bugReports.critical} critical)` : ""}
            {` · ${summary.feedback.open} open feedback`}
            {average ? ` · rated ${average}` : ""}
          </Text>
        ) : null}
      </View>

      {inbox.loading ? (
        <View accessibilityLabel="Loading bug reports and feedback" className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          className="flex-1 bg-bg"
          data={inbox.rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          contentContainerClassName="grow px-4 py-3"
          showsVerticalScrollIndicator={false}
          onEndReached={inbox.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={makeRefreshControl(inbox.refreshing, refresh)}
          ListHeaderComponent={
            inbox.failure ? (
              <View accessibilityLiveRegion="polite" className="mb-3 gap-2 rounded-2xl bg-danger/10 p-3.5">
                <Text variant="meta" className="text-danger">
                  {inbox.failure}
                </Text>
                <Button variant="outline" size="sm" className="self-start" onPress={refresh}>
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            inbox.failure ? undefined : (
              <View className="flex-1 items-center justify-center gap-2 px-6 py-16">
                <MessageSquare color={colors.muted} size={28} />
                <Text variant="title" className="text-center text-ink">
                  {tab === "open" ? "Nothing open" : "Nothing closed yet"}
                </Text>
                <Text variant="meta" className="text-center text-muted">
                  {tab === "open"
                    ? "Bug reports and feedback people send from the app and the web appear here."
                    : "Entries move here once they are resolved, won’t be fixed, or are duplicates."}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            inbox.loadingMore ? (
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

const FeedbackCard = memo(function FeedbackCard({ entry, now }: { entry: AdminFeedback; now: number }) {
  const isBug = entry.kind === "bug_report";
  const critical = entry.severity === "critical";
  const fresh = entry.status === "new";
  const Icon = isBug ? Bug : MessageSquare;
  const status = FEEDBACK_STATUS_LABELS[entry.status];
  const category = entry.category ? FEEDBACK_CATEGORY_LABELS[entry.category] : null;
  const severity = entry.severity ? FEEDBACK_SEVERITY_LABELS[entry.severity] : null;

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={[
        entry.reference,
        FEEDBACK_KIND_LABELS[entry.kind],
        status,
        severity ? `${severity} severity` : null,
        entry.title,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint="Opens the entry to triage it."
      onPress={() => router.push(feedbackEntryHref(entry.id))}
      className={cn(
        "gap-2 rounded-3xl border bg-surface p-4 shadow-md shadow-black/8",
        critical && !isFeedbackClosed(entry.status)
          ? "border-danger/60"
          : "border-line/70",
      )}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon color={isBug ? colors.danger : colors.primary} size={16} />
          <Text variant="label" numberOfLines={1} className="min-w-0 shrink uppercase tracking-wider text-muted">
            {entry.reference || FEEDBACK_KIND_LABELS[entry.kind]}
            {category ? ` · ${category}` : ""}
          </Text>
        </View>
        <Text variant="meta" className="tabular-nums text-muted">
          {reportAge(entry.createdAt, now)}
        </Text>
      </View>

      <Text variant="title" numberOfLines={2} className="text-ink">
        {entry.title}
      </Text>
      {entry.description ? (
        <Text variant="body" numberOfLines={2} className="text-ink-soft">
          {entry.description}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-1.5">
        <View className={cn("rounded-full px-2.5 py-1", fresh ? "bg-primary" : "bg-line/40")}>
          <Text variant="meta" className={cn("font-semibold", fresh ? "text-primary-foreground" : "text-ink-soft")}>
            {status}
          </Text>
        </View>
        {severity ? (
          <View className={cn("rounded-full px-2.5 py-1", critical ? "bg-danger" : "bg-line/40")}>
            <Text variant="meta" className={cn("font-semibold", critical ? "text-primary-foreground" : "text-ink-soft")}>
              {severity}
            </Text>
          </View>
        ) : null}
        {entry.rating !== null ? (
          <Text variant="meta" className="tabular-nums text-muted">
            {entry.rating}/5
          </Text>
        ) : null}
        {entry.attachments.length > 0 ? (
          <View className="flex-row items-center gap-0.5" accessibilityLabel={`${entry.attachments.length} attachments`}>
            <Paperclip color={colors.muted} size={13} />
            <Text variant="meta" className="tabular-nums text-muted">
              {entry.attachments.length}
            </Text>
          </View>
        ) : null}
        <Text variant="meta" numberOfLines={1} className="min-w-0 shrink text-muted">
          {entry.reporter ? entry.reporter.name : "Deleted account"}
          {entry.platform ? ` · ${entry.platform === "ios" ? "iOS" : entry.platform === "android" ? "Android" : "Web"}` : ""}
        </Text>
      </View>
    </TactilePressable>
  );
});
