import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Share, View } from "react-native";

import { Ban, Copy, Link, Plus, Share2 } from "@/components/icons";
import { JoinLinkSheet } from "@/components/hub/join-link-sheet";
import { Pill } from "@/components/hub/pill";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { listJoinLinks, revokeJoinLink } from "@/lib/join-link-api";
import {
  formatJoinLinkDate,
  isJoinLinkLive,
  joinLinkDetail,
  joinLinkOrganizationNames,
  joinLinkShareMessage,
  joinLinkStatusLabel,
  joinLinkUrl,
  orderedJoinLinks,
  withJoinLink,
  type JoinLink,
} from "@/lib/join-links";
import { listOrganizations } from "@/lib/org-api";
import { colors } from "@/lib/tokens";
import type { OrganizationSummary } from "@/lib/types";

/**
 * Organization join links, the Admin's side of them: generate one, hand it to
 * somebody through the platform's share sheet or the clipboard, and revoke it.
 *
 * The web client's Join links page, as a list rather than a table. There is
 * no delete because the API has none: a revoked link stays listed with the
 * reason it is dead, which the Admin who made it is owed — as are an expired
 * one and a single-use one somebody spent. Only a live link offers anything.
 */

type LinksState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; links: JoinLink[] };

type OrganizationsState =
  | { status: "loading" }
  | { status: "failed"; hint: string }
  | { status: "ready"; organizations: OrganizationSummary[] };

function keyExtractor(item: JoinLink) {
  return item.id;
}

/**
 * The share sheet. iOS takes the URL as its own field, so a target that wants a
 * link gets one; Android has only the message, so the link rides inside it.
 */
async function shareJoinLink(link: JoinLink): Promise<void> {
  const url = joinLinkUrl(link.token);
  await Share.share(
    Platform.OS === "ios"
      ? { message: `Join ${joinLinkOrganizationNames(link)} on ChatRoute`, url }
      : { message: joinLinkShareMessage(link) },
    { subject: "Join on ChatRoute", dialogTitle: "Share join link" },
  );
}

export function JoinLinksScreen() {
  const [state, setState] = useState<LinksState>({ status: "loading" });
  const [organizations, setOrganizations] = useState<OrganizationsState>({
    status: "loading",
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Which link has a revoke out for it, so its row can say it is working. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** One line above the list: what just happened, or why it did not. */
  const [notice, setNotice] = useState<{ tone: "ok" | "problem"; text: string } | null>(
    null,
  );

  const load = useCallback(() => {
    void listJoinLinks().then((result) => {
      if (result.ok) {
        setState({ status: "ready", links: result.value });
        return;
      }
      const failure = failureNotice(result.failure, "Could not load join links");
      setState((held) =>
        held.status === "ready"
          ? held
          : { status: "failed", title: failure.title, hint: failure.hint },
      );
      setNotice({ tone: "problem", text: failure.hint });
    });
  }, []);

  const loadOrganizations = useCallback(() => {
    void listOrganizations().then((result) => {
      setOrganizations(
        result.ok
          ? { status: "ready", organizations: result.value }
          : {
              status: "failed",
              hint: failureNotice(result.failure, "Could not load organizations").hint,
            },
      );
    });
  }, []);

  useEffect(() => {
    load();
    loadOrganizations();
  }, [load, loadOrganizations]);

  const links = useMemo(
    () => (state.status === "ready" ? orderedJoinLinks(state.links) : []),
    [state],
  );

  const openSheet = useCallback(() => {
    if (organizations.status === "failed") {
      setOrganizations({ status: "loading" });
      loadOrganizations();
    }
    setSheetOpen(true);
  }, [loadOrganizations, organizations.status]);

  const created = useCallback((link: JoinLink) => {
    setSheetOpen(false);
    setState((held) => ({
      status: "ready",
      links: withJoinLink(held.status === "ready" ? held.links : [], link),
    }));
    setNotice({ tone: "ok", text: "Join link ready. Share it or copy it from the top of the list." });
  }, []);

  const share = useCallback((link: JoinLink) => {
    void shareJoinLink(link).catch(() => {
      setNotice({ tone: "problem", text: "Could not open the share sheet. Copy the link instead." });
    });
  }, []);

  const copy = useCallback((link: JoinLink) => {
    void Clipboard.setStringAsync(joinLinkUrl(link.token)).then(
      () => setNotice({ tone: "ok", text: "Link copied." }),
      () => setNotice({ tone: "problem", text: "Could not copy the link." }),
    );
  }, []);

  const revoke = useCallback(
    (link: JoinLink) => {
      setBusyId(link.id);
      setNotice(null);
      void revokeJoinLink(link.id).then((result) => {
        setBusyId(null);
        if (!result.ok) {
          setNotice({
            tone: "problem",
            text: failureNotice(result.failure, "Could not revoke the join link").hint,
          });
          return;
        }
        // Drawn dead at once, then re-read so the row carries the API's own times.
        setState((held) =>
          held.status === "ready"
            ? {
                status: "ready",
                links: withJoinLink(held.links, {
                  ...link,
                  status: "revoked",
                  revokedAt: link.revokedAt ?? new Date().toISOString(),
                }),
              }
            : held,
        );
        setNotice({ tone: "ok", text: "Join link revoked. Nobody else can join with it." });
        load();
      });
    },
    [load],
  );

  const confirmRevoke = useCallback(
    (link: JoinLink) => {
      Alert.alert(
        "Revoke this join link?",
        `Nobody else can use it to join ${joinLinkOrganizationNames(link)}. People who already joined stay members. This cannot be undone.`,
        [
          { text: "Keep", style: "cancel" },
          { text: "Revoke", style: "destructive", onPress: () => revoke(link) },
        ],
      );
    },
    [revoke],
  );

  const renderItem = useCallback(
    ({ item }: { item: JoinLink }) => {
      const live = isJoinLinkLive(item);
      const busy = busyId === item.id;
      const names = joinLinkOrganizationNames(item);
      return (
        <View
          className={cn(
            "gap-2.5 rounded-2xl border border-line/70 bg-surface p-3.5",
            !live && "opacity-70",
          )}
        >
          <View className="flex-row items-start gap-3">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="label" className="font-semibold text-ink" numberOfLines={2}>
                {names}
              </Text>
              <Text variant="label" className="font-normal text-muted">
                {joinLinkDetail(item, formatJoinLinkDate)}
              </Text>
              {item.createdByName ? (
                <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
                  Created by {item.createdByName}
                </Text>
              ) : null}
            </View>
            {live ? (
              <Pill label={joinLinkStatusLabel(item.status)} tone="success" dot />
            ) : (
              <View className="rounded-full bg-line/60 px-2.5 py-0.5">
                <Text variant="label" className="text-ink-soft">
                  {joinLinkStatusLabel(item.status)}
                </Text>
              </View>
            )}
          </View>

          {live ? (
            <View className="flex-row items-center gap-2">
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Share join link for ${names}`}
                onPress={() => share(item)}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4"
              >
                <Share2 color={colors.primaryForeground} size={16} />
                <Text variant="label" className="font-semibold text-primary-foreground">
                  Share
                </Text>
              </TactilePressable>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Copy join link for ${names}`}
                onPress={() => copy(item)}
                className="size-11 items-center justify-center rounded-full bg-line/60"
              >
                <Copy color={colors.inkSoft} size={18} />
              </TactilePressable>
              {busy ? (
                <View className="size-11 items-center justify-center">
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Revoke join link for ${names}`}
                  onPress={() => confirmRevoke(item)}
                  className="size-11 items-center justify-center rounded-full bg-line/60"
                >
                  <Ban color={colors.danger} size={18} />
                </TactilePressable>
              )}
            </View>
          ) : null}
        </View>
      );
    },
    [busyId, confirmRevoke, copy, share],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-2.5 border-b border-line/60 bg-surface px-4 pb-3.5 pt-3">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="New join link"
          onPress={openSheet}
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-primary"
        >
          <Plus color={colors.primaryForeground} size={18} />
          <Text variant="label" className="font-semibold text-primary-foreground">
            New join link
          </Text>
        </TactilePressable>
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            variant="label"
            className={cn("font-normal", notice.tone === "problem" ? "text-danger" : "text-ink-soft")}
          >
            {notice.text}
          </Text>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={links}
        keyExtractor={keyExtractor}
        contentContainerClassName="gap-2.5 px-4 py-3"
        renderItem={renderItem}
        onRefresh={load}
        refreshing={false}
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
                onPress={load}
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
                <Link color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                No join links yet
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Create one above and share it. Whoever opens it while signed in joins the
                organizations it names.
              </Text>
            </View>
          )
        }
      />

      <JoinLinkSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        organizations={organizations.status === "ready" ? organizations.organizations : []}
        organizationsLoading={organizations.status === "loading"}
        organizationsProblem={organizations.status === "failed" ? organizations.hint : null}
        onCreated={created}
      />
    </View>
  );
}
