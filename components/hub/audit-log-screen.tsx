import { memo, useCallback } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Activity } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { activityActorName, describeActivity } from "@/lib/activity-copy";
import { formatRelativeTime, initials } from "@/lib/display";
import { settleEnter } from "@/lib/motion-enter";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { useActivityList } from "@/lib/use-activity-list";
import type { ActivityEvent } from "@/lib/types";

/**
 * The Audit log: what the team has been doing, newest first.
 *
 * The web client's Activity page, read on a phone: one sentence per entry and
 * when it happened, with a search that goes to the API. The API, the web client
 * and the `lib/activity-*` modules under this screen call it activity, after
 * `GET /activity`; on screen and in the glossary it is the Audit log, because
 * the glossary keeps "activity" off a System notice and a Notification row,
 * and a bare "Activity" invites exactly that confusion.
 * Offered to an Admin holding `view_team_activity`, which is what the API
 * checks; the table, its filters and the detail pane stay on web, the way the
 * rest of mobile Admin is the overview and not the whole desk.
 *
 * Nothing here is a control. A row says what happened; acting on it is done
 * where the thing it names lives.
 */

function keyExtractor(item: ActivityEvent) {
  return item.id;
}

function Separator() {
  return <View className="h-3" />;
}

const AuditLogRow = memo(function AuditLogRow({ event }: { event: ActivityEvent }) {
  const sentence = describeActivity(event);
  const actor = activityActorName(event);
  const age = formatRelativeTime(event.at);

  // No entrance: a FlatList mounts this row on every scroll into the window.
  return (
    <View
      accessible
      accessibilityLabel={`${sentence}, ${age}`}
      className="flex-row items-start gap-3.5 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
    >
      <Avatar alt="" className="size-10">
        <AvatarFallback className={actor ? "bg-primary-soft" : "bg-line/70"}>
          {/* The system and an account that has since gone have no face, so
              they get the log's own mark rather than a question mark. */}
          {actor ? (
            <Text variant="meta" className="font-bold text-primary">
              {initials(actor)}
            </Text>
          ) : (
            <Activity color={colors.inkSoft} size={18} />
          )}
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text variant="body" className="text-ink">
          {sentence}
        </Text>
        <Text variant="meta" className="mt-0.5 text-muted">
          {age}
        </Text>
      </View>
    </View>
  );
});

function renderItem({ item }: { item: ActivityEvent }) {
  return <AuditLogRow event={item} />;
}

export function AuditLogScreen() {
  const view = useActivityList();
  const reduceMotion = useReducedMotion();
  const { feed } = view;
  const events = feed.status === "ready" ? feed.events : [];

  const onEndReached = useCallback(() => {
    // A page that failed is asked for again by its own control, not by the
    // next scroll: a list that retries on every flick at the end is a loop.
    if (view.moreFailure) return;
    view.loadMore();
  }, [view]);

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={view.query}
          onChangeText={view.setQuery}
          placeholder="Search by person or action…"
          accessibilityLabel="Search the audit log"
        />
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={events}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={Separator}
        renderItem={renderItem}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={makeRefreshControl(view.refreshing, view.refresh)}
        ListFooterComponent={
          view.loadingMore ? (
            <View accessibilityLabel="Loading more of the audit log" className="items-center py-5">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : view.moreFailure ? (
            <View accessibilityLiveRegion="polite" className="items-center gap-2 py-5">
              <Text variant="meta" className="text-center text-muted">
                {view.moreFailure}
              </Text>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                accessibilityHint="Loads the next page of the audit log"
                onPress={view.loadMore}
                className="min-h-11 justify-center rounded-full border border-line/80 bg-surface px-5"
              >
                <Text variant="label" className="font-semibold text-ink">
                  Try again
                </Text>
              </TactilePressable>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          feed.status === "loading" ? (
            <View accessibilityLabel="Loading the audit log" className="gap-3">
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="flex-row items-start gap-3.5 rounded-3xl border border-line/70 bg-surface p-4"
                >
                  <View className="size-10 rounded-full bg-muted/15" />
                  <View className="flex-1 gap-2">
                    <View className="h-3.5 w-4/5 rounded-full bg-muted/15" />
                    <View className="h-3 w-1/4 rounded-full bg-muted/10" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Animated.View
              entering={settleEnter(!!reduceMotion)}
              accessibilityLiveRegion="polite"
              className="items-center px-4 py-16"
            >
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Activity color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                {feed.status === "failed"
                  ? feed.title
                  : view.query.trim()
                    ? "Nothing matches"
                    : "Nothing yet"}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {feed.status === "failed"
                  ? feed.hint
                  : view.query.trim()
                    ? "Try a different name or action."
                    : "What the team does will be listed here as it happens."}
              </Text>
              {feed.status === "failed" ? (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={view.reload}
                  className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
                >
                  <Text variant="label" className="font-semibold text-primary-foreground">
                    Try again
                  </Text>
                </TactilePressable>
              ) : null}
            </Animated.View>
          )
        }
      />
    </View>
  );
}
