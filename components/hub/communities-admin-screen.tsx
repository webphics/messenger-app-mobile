import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import { CommunitySheet } from "@/components/hub/community-sheet";
import { Pencil, Plus, Users } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { can } from "@/lib/capabilities";
import { listCommunities } from "@/lib/community-api";
import { communityHref } from "@/lib/community-route";
import { restoreCommunities, saveCommunities } from "@/lib/conversation-store";
import { failureNotice } from "@/lib/conversation-failure";
import { colors } from "@/lib/tokens";
import { useViewer } from "@/lib/use-viewer";
import type { Community } from "@/lib/types";

/**
 * Every Community in the product, for an Admin.
 *
 * Opening one goes to the same Community screen members use. Creating and
 * editing are drawn for a viewer holding `create_communities`, which is what the
 * API asks for; members, Moderators and linked Groups are managed on web.
 */

type ListState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; communities: Community[] };

type SheetState = { community: Community | null } | null;

function keyExtractor(item: Community) {
  return item.id;
}

export function CommunitiesAdminScreen() {
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const canManage = can(viewer, "create_communities");
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const generation = useRef(0);

  /**
   * Written through to the Store, which is where the Community screen reads a
   * Community's name from. It is the same list an Admin's Communities tab holds
   * (every Community), so this agrees with the tab rather than adding to it.
   */
  const remember = useCallback(
    (communities: Community[]) => {
      if (!viewerId) return;
      void saveCommunities(viewerId, {
        communities,
        expanded: restoreCommunities(viewerId).expanded,
      });
    },
    [viewerId],
  );

  const load = useCallback(() => {
    const mine = (generation.current += 1);
    void listCommunities().then((result) => {
      if (generation.current !== mine) return;
      setRefreshing(false);
      if (!result.ok) {
        const notice = failureNotice(result.failure, "Could not load communities");
        setState({ status: "failed", title: notice.title, hint: notice.hint });
        return;
      }
      const communities = [...result.value].sort((a, b) => a.name.localeCompare(b.name));
      setState({ status: "ready", communities });
      remember(communities);
    });
  }, [remember]);

  useEffect(() => load(), [load]);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return state.communities;
    return state.communities.filter(
      (community) =>
        community.name.toLowerCase().includes(needle) ||
        (community.description ?? "").toLowerCase().includes(needle),
    );
  }, [search, state]);

  const saved = useCallback((community: Community) => {
    setState((held) => {
      const list = held.status === "ready" ? held.communities : [];
      const known = list.some((row) => row.id === community.id);
      const next = known ? list.map((row) => (row.id === community.id ? community : row)) : [...list, community];
      const sorted = next.sort((a, b) => a.name.localeCompare(b.name));
      remember(sorted);
      return { status: "ready", communities: sorted };
    });
  }, [remember]);

  const renderItem = useCallback(
    ({ item }: { item: Community }) => (
      <View className="flex-row items-start gap-2 rounded-2xl border border-line/70 bg-surface p-3.5">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          onPress={() => router.push(communityHref(item.id))}
          className="min-w-0 flex-1 gap-1"
        >
          <Text variant="label" numberOfLines={1} className="font-semibold text-ink">
            {item.name}
          </Text>
          {item.description ? (
            <Text variant="meta" numberOfLines={2} className="text-muted">
              {item.description}
            </Text>
          ) : null}
          <Text variant="label" className="font-normal text-ink-soft">
            {item.memberCount} {item.memberCount === 1 ? "member" : "members"} · {item.linkedGroupCount}{" "}
            {item.linkedGroupCount === 1 ? "group" : "groups"}
          </Text>
        </TactilePressable>
        {canManage ? (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            onPress={() => setSheet({ community: item })}
            className="size-11 items-center justify-center rounded-full"
          >
            <Pencil color={colors.muted} size={18} />
          </TactilePressable>
        ) : null}
      </View>
    ),
    [canManage],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 border-b border-line/60 bg-surface px-4 pb-3.5 pt-3">
        <View className="flex-1">
          <SearchFieldWithClear
            value={search}
            onChangeText={setSearch}
            placeholder="Search communities…"
            accessibilityLabel="Search communities"
          />
        </View>
        {canManage ? (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="New community"
            onPress={() => setSheet({ community: null })}
            className="size-11 items-center justify-center rounded-2xl bg-primary"
          >
            <Plus color={colors.primaryForeground} size={20} />
          </TactilePressable>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 py-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
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
                onPress={() => {
                  setState({ status: "loading" });
                  load();
                }}
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
                <Users color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-center text-ink">
                {search.trim() ? "No community matches" : "No communities yet"}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {search.trim()
                  ? "Try another name."
                  : canManage
                    ? "Create one to gather an organization's people and groups in one place."
                    : "Communities the team creates will be listed here."}
              </Text>
            </View>
          )
        }
      />

      <CommunitySheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        community={sheet?.community ?? null}
        onSaved={saved}
      />
    </View>
  );
}
