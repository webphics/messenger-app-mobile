import { ActivityIndicator, Switch, View } from "react-native";

import { Newspaper } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";
import { usePostNotifications } from "@/lib/use-post-notifications";

/**
 * Which organizations may notify this person about a Post.
 *
 * Off by default and on only because somebody said so, which is the opposite of
 * everything else on this screen and the whole reason it is a switch rather than
 * a mute: a Broadcast reaches whoever has not opted out and an essential one
 * reaches past even that, and a Post reaches nobody who has not named its
 * organization here. There is no kind of Post that overrides it — see
 * `lib/post-notifications`.
 *
 * Above `NotificationPermissionRow` and below Sign out for the reason that row
 * is last: it appears a frame or two after this screen draws, and nothing that
 * arrives late belongs above a destructive control. This card is here on every
 * visit, so it sits with the rest of the screen.
 *
 * It changes nothing about notifications themselves. The permission is still
 * asked for by the two moments that ask, the In-app banner is still fed by the
 * socket, and a read still clears the shade — this is a standing answer kept by
 * the API about who may write to it, not a switch over anything on this phone.
 *
 * ## Why the row is the control
 *
 * The switch is drawn but never touched: the whole row is one pressable, so the
 * name, the line under it and the switch are a single target well over the
 * minimum rather than a 32-pixel thumb-sized one with two dead zones beside it.
 * The switch inside is hidden from assistive technology for the same reason —
 * one row, one accessible control, announced as the switch it is.
 */
export function PostNotificationsCard() {
  const view = usePostNotifications();
  // One request at a time, and every row says so: a switch that cannot be
  // moved must not look like one that can.
  const busy = view.busyId !== null;

  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
      <View className="mb-3 flex-row items-center gap-2 border-b border-line/60 pb-3">
        <Newspaper color={colors.muted} size={16} />
        <Text variant="label" className="uppercase tracking-wider text-muted">
          Post notifications
        </Text>
      </View>

      <Text variant="label" className="mb-3 font-normal leading-5 text-muted">
        Choose which organizations may notify you about Posts. A Post will not
        reach you unless its organization is on.
      </Text>

      {/* A failure over switches already drawn is a line beside them rather than
          a screen in their place — `lib/post-notifications-notice` decides which,
          and the order is `read-notice`'s, shared with the Wall and a thread. */}
      {view.notice.kind === "failed" ? (
        <View className="gap-3">
          <View>
            <Text variant="meta" className="font-semibold text-ink">
              {view.notice.title}
            </Text>
            <Text variant="label" className="font-normal leading-5 text-muted">
              {view.notice.hint}
            </Text>
          </View>
          <Button variant="outline" className="min-h-12" onPress={view.reload}>
            <Text>Try again</Text>
          </Button>
        </View>
      ) : view.notice.kind === "loading" ? (
        <View className="min-h-12 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : view.notice.kind === "empty" ? (
        <Text variant="label" className="font-normal leading-5 text-muted">
          {view.notice.hint}
        </Text>
      ) : (
        <View>
          {view.notice.kind === "stale" ? (
            <Text
              accessibilityLiveRegion="polite"
              variant="label"
              className="mb-3 font-normal leading-5 text-amber"
            >
              {view.notice.message}
            </Text>
          ) : null}

          {view.rows.map((row) => (
            <TactilePressable
              key={row.id}
              accessibilityRole="switch"
              accessibilityLabel={`Post notifications from ${row.name}`}
              accessibilityState={{ checked: row.on, disabled: busy }}
              disabled={busy}
              onPress={() => view.toggle(row)}
              className="min-h-12 flex-row items-center justify-between gap-3 py-1.5"
            >
              <View className="min-w-0 flex-1">
                <Text variant="meta" className="font-semibold text-ink" numberOfLines={1}>
                  {row.name}
                </Text>
                <Text variant="label" className="font-normal leading-5 text-muted">
                  {row.on
                    ? "Posts from here can notify you."
                    : "Posts from here will not reach you."}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                {/* Beside the switch rather than in place of it: a control that
                    vanished while its request was out would be the answer
                    disappearing at the moment somebody is watching for it. */}
                {view.busyId === row.id ? (
                  <ActivityIndicator color={colors.muted} />
                ) : null}
                <View
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  <Switch
                    value={row.on}
                    trackColor={{ false: colors.line, true: colors.primary }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.line}
                  />
                </View>
              </View>
            </TactilePressable>
          ))}
        </View>
      )}

      {/* What the phone cannot promise, whatever a switch says. Under the rows
          rather than over them, because it is about this device and they are
          about the organizations — and it is gone by the next foreground for
          anybody who turns notifications on. */}
      {view.caveat && view.notice.kind !== "failed" ? (
        <Text variant="label" className="mt-3 font-normal leading-5 text-amber">
          {view.caveat}
        </Text>
      ) : null}

      {view.error ? (
        <Text
          accessibilityLiveRegion="polite"
          variant="label"
          className="mt-3 text-danger"
        >
          {view.error}
        </Text>
      ) : null}
    </View>
  );
}
