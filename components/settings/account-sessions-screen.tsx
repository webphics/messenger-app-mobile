import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InScreenHeader } from "@/components/in-screen-header";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  readAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
} from "@/lib/account-session-api";
import {
  accountSessionRows,
  currentAccountSessionId,
  signOutOthersControl,
  type AccountSessionRow,
} from "@/lib/account-session-rows";
import type { ApiFailure } from "@/lib/api-result";
import { formatRelativeTime } from "@/lib/display";
import { readNotice } from "@/lib/read-notice";
import { colors, screenBottomPad } from "@/lib/tokens";
import type { AccountSession } from "@/lib/types";

/**
 * Where this account is signed in, and how to end a session that is not this
 * device.
 *
 * Pushed from the account card on Settings and living outside the three role
 * groups, per ADR-0012: governing your own account belongs to the account rather
 * than to the role, so nothing here reads one.
 *
 * ## What this screen does not offer
 *
 * The device in hand carries no revoke. That is `lib/account-session-rows`'
 * rule, not this screen's, and the reason is that revoking the session this app
 * is holding is a sign-out, and a sign-out here also destroys the local Store
 * through `lib/session-wipe`. Sign out already sits on the Settings screen one
 * push back and says so. What this screen adds is the sentence under that row
 * saying where the control is, so the absence reads as a decision rather than as
 * something missing.
 *
 * Nothing deletes a session from history. `DELETE /sessions/:id` exists, has no
 * wrapper in `lib/account-session-api` and no control here, mirroring root ADR
 * 0008: revoking ends access and leaves the record, while deleting erases the
 * evidence that a session existed at all.
 *
 * ## What a revoke tells the other device, and when
 *
 * Revoking many pushes a realtime signal to the devices it ended; revoking one
 * does not. Recorded in root ADR 0008, triaged separately, and built against
 * rather than around: a phone whose session was ended on its own learns at its
 * next call to the API, which is a `401`, which the transport already turns into
 * an ordinary end of session. Nothing here waits for, or claims, anything more
 * than the API's answer.
 *
 * ## Why the list changes after the answer rather than before it
 *
 * Every other optimistic path in this app moves first and rolls back on a
 * refusal, because a message that did not send can be sent again. A revoke
 * cannot be taken back, and the thing somebody is watching for is whether a
 * device they do not recognise is actually gone. Showing it gone before it is
 * would be a claim about their account's security that this phone cannot make,
 * so the row leaves when the API says it has.
 */

/** What the four read outcomes say on this screen. Precedence is `readNotice`'s. */
const COPY = {
  refusedTitle: "Could not load your sessions",
  emptyTitle: "No active sessions",
  emptyHint: "Nothing is signed in to this account right now.",
};

/**
 * Which control has a request out.
 *
 * One at a time and named, rather than a boolean, because the spinner belongs on
 * the control that was tapped and every other control has to be disabled while
 * it is out: two revokes racing would leave the list reflecting whichever
 * answered last.
 */
type Busy = { kind: "one"; id: string } | { kind: "others" } | null;

/** A failed action, kept with what it was about so the retry can be the same one. */
type ActionFailure = {
  target: { kind: "one"; id: string; title: string } | { kind: "others" };
  message: string;
};

/**
 * One sentence for a revoke that did not happen.
 *
 * `lib/conversation-failure`'s shape, kept here rather than added to that file
 * because the copy is about a device on this screen and that module is the
 * conversation feature's. The four cases exist because a person answers each
 * differently and the ticket asks for a failure to read differently from a
 * refusal: a request that never arrived is worth retrying, a refusal has
 * something of the API's own to say, and a body this client could not read is
 * worth saying is not their fault. An expired session says nothing, for the
 * reason it says nothing anywhere else: the auth layer is already on its way to
 * sign-in, and a line about a session would arrive on a screen that is leaving.
 */
function revokeRefusal(failure: ApiFailure): string {
  switch (failure.kind) {
    case "unreachable":
      return "Could not reach the server, so nothing was ended. Check your connection and try again.";
    case "refused":
      return failure.message;
    case "malformed":
      return "The server answered with something this app did not understand. Nothing is certain to have been ended.";
    case "unauthorised":
      return "";
  }
}

/**
 * Ask before ending a session.
 *
 * `lib/confirm-sign-out` is the model and deliberately not the function: that
 * one is about this device and says so in its wording, and both dialogs here
 * have to name the device they are about. Same shape, so the destructive button
 * is marked as such on iOS, and so a dismissal resolves rather than leaving the
 * caller's promise hanging, which Android's back gesture would otherwise do.
 */
function confirmEnding(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** When the session was last touched, in words, or nothing if the API sent no time. */
function lastActiveLine(iso: string): string {
  const relative = formatRelativeTime(iso);
  return relative === "" ? "" : `Last active ${relative}`;
}

export function AccountSessionsScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [actionFailure, setActionFailure] = useState<ActionFailure | null>(null);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /** The request alone, with no state to set before it goes out. */
  const fetchSessions = useCallback(() => {
    void readAccountSessions().then((result) => {
      if (!live.current) return;
      setLoading(false);
      if (!result.ok) return setFailure(result.failure);
      setSessions(result.value);
    });
  }, []);

  /**
   * Asking again: back to loading, and the last failure goes with the attempt
   * that produced it. The first read needs neither — `loading` starts true and
   * `failure` starts null — which is why the mount effect below calls the
   * request rather than this, and so sets no state synchronously inside an
   * effect.
   */
  const load = useCallback(() => {
    setLoading(true);
    setFailure(null);
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => fetchSessions(), [fetchSessions]);

  const currentId = currentAccountSessionId(sessions);
  const rows = accountSessionRows(sessions, currentId);
  const signOutOthers = signOutOthersControl(rows);
  const notice = readNotice(
    { drawn: rows.length, confirmed: rows.length, loading, failure },
    COPY,
  );

  const endOne = useCallback(
    (row: AccountSessionRow) => {
      if (busy) return;
      void confirmEnding(
        "End this session?",
        `${row.title} will be signed out of your account. Nothing on this device changes.`,
        "End session",
      ).then((goAhead) => {
        if (!goAhead || !live.current) return;

        setBusy({ kind: "one", id: row.id });
        setActionFailure(null);

        void revokeAccountSession(row.id).then((result) => {
          if (!live.current) return;
          setBusy(null);

          if (!result.ok) {
            setActionFailure({
              target: { kind: "one", id: row.id, title: row.title },
              message: revokeRefusal(result.failure),
            });
            return;
          }

          // The list reflects it here rather than through a second read: the
          // API has said the session is over, and a revoked session is not an
          // active one, so it leaves the list this screen asked for.
          setSessions((held) => held.filter((item) => item.id !== row.id));
        });
      });
    },
    [busy],
  );

  const endOthers = useCallback(() => {
    if (busy) return;
    void confirmEnding(
      "Sign out everywhere else?",
      "Every other device will be signed out of your account. This device stays signed in.",
      "Sign out everywhere else",
    ).then((goAhead) => {
      if (!goAhead || !live.current) return;

      setBusy({ kind: "others" });
      setActionFailure(null);

      void revokeOtherAccountSessions().then((result) => {
        if (!live.current) return;
        setBusy(null);

        if (!result.ok) {
          setActionFailure({
            target: { kind: "others" },
            message: revokeRefusal(result.failure),
          });
          return;
        }

        // The API spares the session the request was made under, so what is
        // left is this device and nothing else. Where the answer never marked
        // one, this phone does not know which row survived and asks rather
        // than guessing at an empty list.
        if (currentId) {
          setSessions((held) => held.filter((item) => item.id === currentId));
        } else {
          load();
        }
      });
    });
  }, [busy, currentId, load]);

  const retryAction = useCallback(() => {
    const target = actionFailure?.target;
    if (!target) return;
    if (target.kind === "others") return endOthers();

    const row = rows.find((item) => item.id === target.id);
    if (row) endOne(row);
  }, [actionFailure, endOne, endOthers, rows]);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Where you’re signed in
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 24) }}
      >
        <Text variant="label" className="mb-4 font-normal leading-5 text-muted">
          Every device your account is signed in on. Ending a session signs that
          device out the next time it reaches JoyChat.
        </Text>

        {notice.kind === "loading" ? (
          <View className="min-h-24 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {notice.kind === "failed" ? (
          <View className="gap-3 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
            <View>
              <Text variant="title" className="text-ink">
                {notice.title}
              </Text>
              <Text variant="label" className="font-normal leading-5 text-muted">
                {notice.hint}
              </Text>
            </View>
            <Button variant="outline" className="min-h-12" onPress={load}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : null}

        {notice.kind === "empty" ? (
          <View className="rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
            <Text variant="title" className="text-ink">
              {notice.title}
            </Text>
            <Text variant="label" className="font-normal leading-5 text-muted">
              {notice.hint}
            </Text>
          </View>
        ) : null}

        {rows.length > 0 ? (
          <View className="rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5">
            {/* A read that failed over sessions already drawn is a line above
                them rather than a screen in their place: what is drawn is still
                true, and it is dismissed by the next successful read rather than
                retried. `readNotice` decides which of the two this is. */}
            {notice.kind === "stale" ? (
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="mb-3 font-normal leading-5 text-amber"
              >
                {notice.message}
              </Text>
            ) : null}

            {rows.map((row, index) => (
              <View
                key={row.id}
                className={
                  index < rows.length - 1
                    ? "gap-2 border-b border-line/60 py-3"
                    : "gap-2 py-3"
                }
              >
                <View className="min-w-0">
                  <Text
                    variant="meta"
                    className="font-semibold text-ink"
                    numberOfLines={1}
                  >
                    {row.title}
                  </Text>
                  {row.detail === "" ? null : (
                    <Text
                      variant="label"
                      className="font-normal leading-5 text-muted"
                      numberOfLines={1}
                    >
                      {row.detail}
                    </Text>
                  )}
                  {lastActiveLine(row.lastActiveAt) === "" ? null : (
                    <Text variant="label" className="font-normal leading-5 text-muted">
                      {lastActiveLine(row.lastActiveAt)}
                    </Text>
                  )}
                </View>

                {row.thisDevice ? (
                  <View className="gap-1.5">
                    {/* A word as well as the pill's colour: a mark that is only
                        a tint is a mark nobody reading with a screen reader or
                        without colour ever gets. */}
                    <View className="self-start rounded-full bg-primary-soft px-2.5 py-0.5">
                      <Text
                        variant="label"
                        className="font-bold uppercase tracking-wider text-primary"
                      >
                        This device
                      </Text>
                    </View>
                    <Text variant="label" className="font-normal leading-5 text-muted">
                      Sign out on the Settings screen ends this one.
                    </Text>
                  </View>
                ) : null}

                {row.action.kind === "revoke" ? (
                  <Button
                    variant="outline"
                    className="min-h-11 border-danger/30 active:bg-danger/10"
                    accessibilityLabel={row.action.accessibilityLabel}
                    accessibilityState={{ disabled: busy !== null }}
                    disabled={busy !== null}
                    onPress={() => endOne(row)}
                  >
                    {busy?.kind === "one" && busy.id === row.id ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : null}
                    <Text className="text-danger">{row.action.label}</Text>
                  </Button>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Only when `lib/account-session-rows` says so, which is when there is
            more than one session. A lone other session already carries its own
            revoke, and a lone current one leaves this with nothing to end. */}
        {signOutOthers ? (
          <View className="mt-4">
            <Button
              variant="outline"
              className="min-h-12 border-danger/30 active:bg-danger/10"
              accessibilityLabel={signOutOthers.accessibilityLabel}
              accessibilityState={{ disabled: busy !== null }}
              disabled={busy !== null}
              onPress={endOthers}
            >
              {busy?.kind === "others" ? (
                <ActivityIndicator color={colors.danger} />
              ) : null}
              <Text className="text-danger">{signOutOthers.label}</Text>
            </Button>
          </View>
        ) : null}

        {/* A revoke that did not happen says so and offers the same one again,
            rather than leaving somebody to work out whether the row that is
            still there is still signed in. Silent for an expired session, which
            is already on its way to sign-in. */}
        {actionFailure && actionFailure.message !== "" ? (
          <View className="mt-4 gap-3 rounded-2xl border border-danger/30 bg-surface p-4">
            <Text
              accessibilityLiveRegion="polite"
              variant="label"
              className="font-normal leading-5 text-danger"
            >
              {actionFailure.message}
            </Text>
            <Button
              variant="outline"
              className="min-h-11"
              accessibilityLabel={
                actionFailure.target.kind === "others"
                  ? "Try signing out of every session except this device again"
                  : `Try ending the session on ${actionFailure.target.title} again`
              }
              accessibilityState={{ disabled: busy !== null }}
              disabled={busy !== null}
              onPress={retryAction}
            >
              <Text>Try again</Text>
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
