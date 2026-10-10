import { router, type Href } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommunityLoading, CommunityNoticeView } from "@/components/communities/community-notice-view";
import { Bell, CheckCheck, X } from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { NotificationRow } from "@/components/notifications/notification-row";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { chatHref } from "@/lib/chat-route-id";
import { cn } from "@/lib/cn";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { pushRouteHref } from "@/lib/hub-routes";
import { useNotificationBadge } from "@/lib/notification-badge";
import {
  notificationDestination,
  notificationSections,
  type NotificationDestination,
} from "@/lib/notification-feed";
import { mayEnter, SCREEN_ACCESS } from "@/lib/route-access";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { AppNotification, UserRole } from "@/lib/types";
import { useNotificationFeed } from "@/lib/use-notification-feed";
import { useViewer } from "@/lib/use-viewer";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
] as const;

/**
 * The in-app notification feed: everything `GET /notifications` holds for this
 * person, newest first, under Today, Yesterday and Earlier.
 *
 * Reached from the bell on the Hub rather than from the Tab capsule — the
 * capsule is where somebody works, and this is a place to catch up, which is
 * the shape every app this one sits beside gives it. Beside the role groups in
 * the root stack, like Saved and the account screens, because all three roles
 * have the same feed and the API scopes it to the caller.
 *
 * A tap marks the row read and opens what it is about — where that is is
 * `notificationDestination`, mirroring the web client — and a row about nothing
 * that can be opened is still marked read, so the bell never holds a count the
 * person has no way to clear.
 */
export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const inbox = useConversationInbox();
  const feed = useNotificationFeed();
  const { unreadCount } = useNotificationBadge();

  const announcementsId = useMemo(() => {
    if (inbox.status !== "ready") return null;
    return inbox.conversations.find((c) => c.type === "broadcast_inbox")?.id ?? null;
  }, [inbox]);

  const sections = useMemo(() => notificationSections(feed.notifications), [feed.notifications]);

  const { markRead } = feed;
  const open = useCallback(
    (notification: AppNotification) => {
      markRead(notification);
      if (!viewer) return;

      const destination = notificationDestination(notification, {
        role: viewer.role,
        announcementsId,
        opensBroadcasts: mayEnter(viewer, SCREEN_ACCESS.broadcasts),
      });
      const href = destination ? hrefOf(destination, viewer.role) : null;
      if (href) router.push(href);
    },
    [announcementsId, markRead, viewer],
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => <NotificationRow notification={item} onPress={open} />,
    [open],
  );

  const { notice } = feed;
  const canMarkAll = unreadCount > 0 || feed.notifications.some((n) => n.readAt === null);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Notifications
        </Text>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          accessibilityState={{ disabled: !canMarkAll || feed.markingAll }}
          disabled={!canMarkAll || feed.markingAll}
          onPress={feed.markAllRead}
          className={cn(
            "mr-2 min-h-11 flex-row items-center gap-1.5 rounded-full px-3",
            !canMarkAll && "opacity-40",
          )}
        >
          {feed.markingAll ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <CheckCheck color={colors.primary} size={18} />
          )}
          <Text variant="label" className="text-primary">
            Mark all read
          </Text>
        </TactilePressable>
      </InScreenHeader>

      <View
        accessibilityRole="tablist"
        className="flex-row gap-2 border-b border-line/60 bg-surface px-4 pb-2.5 pt-2"
      >
        {FILTERS.map((filter) => {
          const selected = (filter.id === "unread") === feed.unreadOnly;
          const count = filter.id === "unread" && unreadCount > 0 ? unreadCount : null;
          return (
            <TactilePressable
              key={filter.id}
              accessibilityRole="tab"
              accessibilityLabel={count != null ? `${filter.label}, ${count}` : filter.label}
              accessibilityState={{ selected }}
              onPress={() => feed.setUnreadOnly(filter.id === "unread")}
              className={cn(
                "min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border",
                selected
                  ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                  : "border-line/80 bg-line/35",
              )}
            >
              <Text
                variant="label"
                className={selected ? "text-primary-foreground" : "text-ink-soft"}
              >
                {filter.label}
              </Text>
              {count != null ? (
                <View
                  className={cn(
                    "min-w-5 items-center rounded-full px-1.5 py-px",
                    selected ? "bg-primary-foreground/25" : "bg-primary",
                  )}
                >
                  <Text variant="label" className="tabular-nums text-primary-foreground">
                    {count > 99 ? "99+" : String(count)}
                  </Text>
                </View>
              ) : null}
            </TactilePressable>
          );
        })}
      </View>

      {notice.kind === "stale" ? (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 border-b border-line/60 bg-line/35 px-4 py-2.5"
        >
          <Text variant="meta" className="min-w-0 flex-1 text-ink-soft">
            {notice.message}
          </Text>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={feed.dismissFailure}
          >
            <X color={colors.muted} size={18} />
          </TactilePressable>
        </View>
      ) : null}

      {notice.kind === "loading" ? (
        <CommunityLoading label="Loading notifications" />
      ) : notice.kind === "failed" || notice.kind === "empty" ? (
        <CommunityNoticeView
          title={notice.title}
          hint={notice.hint}
          failed={notice.kind === "failed"}
          onRetry={notice.kind === "failed" ? feed.retry : undefined}
          icon={Bell}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text
              variant="label"
              accessibilityRole="header"
              className="bg-bg px-1 pb-2 pt-4 uppercase tracking-wider text-muted"
            >
              {section.title}
            </Text>
          )}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={makeRefreshControl(feed.refreshing, feed.refresh)}
          onEndReachedThreshold={0.6}
          onEndReached={feed.loadOlder}
          ListFooterComponent={
            feed.loadingOlder ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function hrefOf(destination: NotificationDestination, role: UserRole): Href {
  switch (destination.kind) {
    case "thread":
      return chatHref(destination.conversationId);
    case "route":
      return pushRouteHref(destination.route, role);
    case "broadcasts":
      return "/(admin)/broadcasts" as Href;
  }
}
