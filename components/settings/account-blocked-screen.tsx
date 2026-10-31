import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InScreenHeader } from "@/components/in-screen-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { refusalSentence } from "@/lib/api-result";
import { useBlocks } from "@/lib/blocks-context";
import type { BlockedPerson } from "@/lib/blocked-people";
import { confirmUnblock } from "@/lib/confirm-block";
import { formatRelativeTime, initials } from "@/lib/display";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * The people this account has blocked, and the way back from each block.
 *
 * Pushed from the account card on Settings and living outside the role groups,
 * per ADR-0012, like every other screen that governs your own account. A block
 * is made from a Post or a Message; this is where it is undone, which is why the
 * question asked before a block says so.
 *
 * The list is the shared one (`lib/blocks-context`), re-read on the way in, so
 * an unblock here brings the person's Posts back on the Wall without a request
 * of its own.
 */
export function AccountBlockedScreen() {
  const insets = useSafeAreaInsets();
  const { blocked, loaded, reload, unblock } = useBlocks();
  const [reading, setReading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    void reload().then((result) => {
      setReading(false);
      if (result && !result.ok) {
        setFailure(refusalSentence(result.failure, "The list could not be read.") ?? null);
      }
    });
  }, [reload]);

  useEffect(() => fetchList(), [fetchList]);

  const read = useCallback(() => {
    setReading(true);
    setFailure(null);
    fetchList();
  }, [fetchList]);

  const release = useCallback(
    (person: BlockedPerson) => {
      if (busy) return;
      void confirmUnblock(person.name).then((goAhead) => {
        if (!goAhead) return;
        setBusy(person.id);
        void unblock(person.id).then((result) => {
          setBusy(null);
          if (result.ok) return;
          const sentence = refusalSentence(result.failure, "That could not be saved.");
          if (sentence) Alert.alert(`Could not unblock ${person.name}`, sentence);
        });
      });
    },
    [busy, unblock],
  );

  const waiting = reading && !loaded;

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Blocked people
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 24) }}
      >
        <Text variant="label" className="mb-4 font-normal leading-5 text-muted">
          You don’t see posts or messages from people you block, and they can’t start a new
          conversation with you. They aren’t told.
        </Text>

        {waiting ? (
          <View className="min-h-24 items-center justify-center" accessibilityLabel="Loading">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {failure ? (
          <View
            accessibilityLiveRegion="polite"
            className="mb-3 gap-3 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
          >
            <Text variant="label" className="font-normal leading-5 text-amber">
              {failure}
            </Text>
            <Button variant="outline" className="min-h-12" onPress={read}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : null}

        {!waiting && !failure && blocked.length === 0 ? (
          <View className="rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
            <Text variant="title" className="text-ink">
              Nobody blocked
            </Text>
            <Text variant="label" className="font-normal leading-5 text-muted">
              To block someone, open the menu on one of their posts or press and hold one of their
              messages.
            </Text>
          </View>
        ) : null}

        {blocked.length > 0 ? (
          <View className="rounded-3xl border border-line bg-surface px-4 shadow-md shadow-black/5">
            {blocked.map((person, index) => (
              <View
                key={person.id}
                className={
                  index < blocked.length - 1
                    ? "min-h-16 flex-row items-center gap-3 border-b border-line/60 py-3"
                    : "min-h-16 flex-row items-center gap-3 py-3"
                }
              >
                <Avatar alt="" className="size-10">
                  <AvatarFallback className="bg-primary-soft">
                    <Text variant="meta" className="font-bold text-primary">
                      {initials(person.name)}
                    </Text>
                  </AvatarFallback>
                </Avatar>
                <View className="min-w-0 flex-1">
                  <Text variant="meta" className="font-semibold text-ink" numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text variant="label" className="font-normal leading-5 text-muted">
                    Blocked {formatRelativeTime(person.blockedAt)}
                  </Text>
                </View>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  accessibilityLabel={`Unblock ${person.name}`}
                  accessibilityState={{ disabled: busy !== null, busy: busy === person.id }}
                  onPress={() => release(person)}
                >
                  {busy === person.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                  <Text>Unblock</Text>
                </Button>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
