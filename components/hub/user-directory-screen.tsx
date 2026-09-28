import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { UserPlus, UserX } from "@/components/icons";
import { NewUserSheet } from "@/components/hub/new-user-sheet";
import { UserDirectoryRow } from "@/components/hub/user-directory-row";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { settleEnter } from "@/lib/motion-enter";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { useUserDirectory } from "@/lib/use-user-directory";
import { useViewer } from "@/lib/use-viewer";
import { canCreateAccounts, userRoleLabel } from "@/lib/user-directory";
import type { ManagedUser, UserRole } from "@/lib/types";

/**
 * Every account, and what an Admin can do to it.
 *
 * This is what replaced the mock Users tab. The tab itself became People —
 * the contact directory, which is who you can write to — because this is a
 * different question with a different audience: it is account management, it
 * is reached from the Admin hub with the rest of the org-wide settings, and
 * nothing on it starts a conversation.
 *
 * The filters are the API's rather than this screen's. Search, role and
 * banned all go into the query, because the user table is the one list in
 * this app a phone has no business narrowing for itself.
 */

const ROLE_CHIPS: readonly (UserRole | "all")[] = ["all", "admin", "agent", "customer"];

function keyExtractor(item: ManagedUser) {
  return item.id;
}

function Separator() {
  return <View className="h-3" />;
}

export function UserDirectoryScreen() {
  const navigation = useNavigation();
  const viewer = useViewer();
  const view = useUserDirectory();
  const reduceMotion = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const mayCreate = canCreateAccounts(viewer);

  useEffect(() => {
    navigation.setOptions({
      // Creating an account needs `manage_users`. Without it the header is left empty.
      headerRight: () =>
        mayCreate ? (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="New account"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            className="mr-2 size-10 items-center justify-center rounded-full bg-primary-soft/80"
            onPress={() => setCreating(true)}
          >
            <UserPlus color={colors.primary} size={20} />
          </TactilePressable>
        ) : null,
    });
  }, [navigation, mayCreate]);

  const toggle = useCallback((userId: string) => {
    setOpenId((current) => (current === userId ? null : userId));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ManagedUser }) => (
      <UserDirectoryRow
        user={item}
        open={item.id === openId}
        onToggle={toggle}
        viewer={viewer}
        organizations={view.organizations}
        actions={view}
      />
    ),
    [openId, toggle, view, viewer],
  );

  const { directory } = view;
  const users = directory.status === "ready" ? directory.users : [];

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={view.query}
          onChangeText={view.setQuery}
          placeholder="Search by name or email…"
          accessibilityLabel="Search accounts"
        />

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          {ROLE_CHIPS.map((chip) => {
            const selected = chip === view.roleFilter;
            const label = chip === "all" ? "All" : `${userRoleLabel(chip)}s`;
            return (
              <TactilePressable
                key={chip}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => view.setRoleFilter(chip)}
                className={cn(
                  "min-h-9 justify-center rounded-full border px-3.5",
                  selected
                    ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                    : "border-line/80 bg-line/35",
                )}
              >
                <Text
                  variant="label"
                  className={selected ? "text-primary-foreground" : "text-ink-soft"}
                >
                  {label}
                </Text>
              </TactilePressable>
            );
          })}

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Banned only"
            accessibilityState={{ selected: view.bannedOnly }}
            onPress={() => view.setBannedOnly(!view.bannedOnly)}
            className={cn(
              "min-h-9 justify-center rounded-full border px-3.5",
              view.bannedOnly
                ? "border-transparent bg-danger shadow-sm shadow-danger/25"
                : "border-line/80 bg-line/35",
            )}
          >
            <Text
              variant="label"
              className={view.bannedOnly ? "text-white" : "text-ink-soft"}
            >
              Banned
            </Text>
          </TactilePressable>
        </View>
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={users}
        extraData={openId}
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
        refreshControl={makeRefreshControl(view.refreshing, view.refresh)}
        ListEmptyComponent={
          directory.status === "loading" ? (
            <View accessibilityLabel="Loading accounts" className="gap-3">
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="flex-row items-center gap-3.5 rounded-3xl border border-line/70 bg-surface p-4"
                >
                  <View className="size-12 rounded-full bg-muted/15" />
                  <View className="flex-1 gap-2">
                    <View className="h-3.5 w-2/5 rounded-full bg-muted/15" />
                    <View className="h-3 w-3/5 rounded-full bg-muted/10" />
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
                <UserX color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                {directory.status === "failed" ? directory.title : "No accounts match"}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {directory.status === "failed"
                  ? directory.hint
                  : "Try a different search, or widen the filters."}
              </Text>
              {directory.status === "failed" ? (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={view.reload}
                  className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
                >
                  <Text
                    variant="label"
                    className="font-semibold text-primary-foreground"
                  >
                    Try again
                  </Text>
                </TactilePressable>
              ) : null}
            </Animated.View>
          )
        }
      />

      <NewUserSheet
        visible={creating}
        onClose={() => setCreating(false)}
        organizations={view.organizations}
        onCreated={view.add}
      />
    </View>
  );
}
