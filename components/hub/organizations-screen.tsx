import { useNavigation, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";

import { Building2, ChevronRight, Pencil, Plus, Trash2 } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { can } from "@/lib/capabilities";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import {
  createOrganization,
  deleteOrganization,
  listOrganizations,
  renameOrganization,
} from "@/lib/org-api";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { OrganizationSummary } from "@/lib/types";
import { useViewer } from "@/lib/use-viewer";

/**
 * The organizations, for an Admin.
 *
 * An organization is the container everything else in this product belongs
 * to — every conversation, every membership, every custom inbox — which is
 * why this screen is the one place a name can be changed and the one place
 * one can be removed. The counts beside each name are the API's, and they
 * are what makes a deletion something a person can weigh rather than guess
 * at.
 *
 * Deletion is the most destructive thing in the app and reads that way: it
 * names the organization, says what goes with it, and takes a deliberate
 * second tap. There is no undo, on either side.
 *
 * Creating, renaming and deleting need `manage_organizations`. Without it the
 * list only reads, and each row still opens its members.
 */

type State =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; organizations: OrganizationSummary[] };

function keyExtractor(item: OrganizationSummary) {
  return item.id;
}

function Separator() {
  return <View className="h-2.5" />;
}

function memberLine(organization: OrganizationSummary): string {
  const members =
    organization.memberCount === 1 ? "1 member" : `${organization.memberCount} members`;
  const conversations =
    organization.conversationCount === 1
      ? "1 conversation"
      : `${organization.conversationCount} conversations`;
  return `${members} · ${conversations}`;
}

export function OrganizationsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const canManage = can(useViewer(), "manage_organizations");
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  /** Which row has a write out for it, or `new` for the create field. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    (search: string) => {
      void listOrganizations({ search }).then((result) => {
        setRefreshing(false);
        if (result.ok) {
          setState({ status: "ready", organizations: result.value });
          return;
        }
        const notice = failureNotice(result.failure, "Could not load organizations");
        setState({ status: "failed", title: notice.title, hint: notice.hint });
      });
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(query), 300);
    return () => clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    if (!canManage) return;
    navigation.setOptions({
      headerRight: () => (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="New organization"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          className="mr-2 size-10 items-center justify-center rounded-full bg-primary-soft/80"
          onPress={() => setComposing((open) => !open)}
        >
          <Plus color={colors.primary} size={20} />
        </TactilePressable>
      ),
    });
  }, [canManage, navigation]);

  const replace = useCallback((organization: OrganizationSummary) => {
    setState((held) =>
      held.status === "ready"
        ? {
            status: "ready",
            organizations: held.organizations.map((row) =>
              row.id === organization.id ? organization : row,
            ),
          }
        : held,
    );
  }, []);

  const create = useCallback(() => {
    const name = draft.trim();
    if (!name || busyId) return;

    setBusyId("new");
    setProblem(null);
    void createOrganization(name).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        setProblem(failureNotice(result.failure, "Could not create it").hint);
        return;
      }
      setState((held) =>
        held.status === "ready"
          ? { status: "ready", organizations: [result.value, ...held.organizations] }
          : { status: "ready", organizations: [result.value] },
      );
      setDraft("");
      setComposing(false);
    });
  }, [busyId, draft]);

  const submitRename = useCallback(
    (organization: OrganizationSummary) => {
      const name = renameDraft.trim();
      if (!name || name === organization.name) {
        setRenamingId(null);
        return;
      }

      setBusyId(organization.id);
      setProblem(null);
      void renameOrganization(organization.id, name).then((result) => {
        setBusyId(null);
        setRenamingId(null);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not rename it").hint);
          return;
        }
        replace(result.value);
      });
    },
    [renameDraft, replace],
  );

  const remove = useCallback((organization: OrganizationSummary) => {
    setBusyId(organization.id);
    setProblem(null);
    void deleteOrganization(organization.id).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        setProblem(failureNotice(result.failure, "Could not delete it").hint);
        return;
      }
      setState((held) =>
        held.status === "ready"
          ? {
              status: "ready",
              organizations: held.organizations.filter(
                (row) => row.id !== organization.id,
              ),
            }
          : held,
      );
    });
  }, []);

  const confirmDelete = useCallback(
    (organization: OrganizationSummary) => {
      Alert.alert(
        `Delete ${organization.name}?`,
        `${memberLine(organization)} belong to it. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => remove(organization),
          },
        ],
      );
    },
    [remove],
  );

  const renderItem = useCallback(
    ({ item }: { item: OrganizationSummary }) => {
      const busy = busyId === item.id;
      const renaming = renamingId === item.id;

      if (renaming) {
        return (
          <View className="gap-2 rounded-2xl border border-primary/40 bg-surface p-3.5">
            <Input
              value={renameDraft}
              onChangeText={setRenameDraft}
              accessibilityLabel="Organization name"
              autoFocus
              maxLength={255}
              returnKeyType="done"
              onSubmitEditing={() => submitRename(item)}
              className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
            />
            <View className="flex-row gap-2">
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setRenamingId(null)}
                className="min-h-11 flex-1 items-center justify-center rounded-xl border border-line/80 bg-line/35"
              >
                <Text variant="label" className="text-ink">
                  Cancel
                </Text>
              </TactilePressable>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Save name"
                onPress={() => submitRename(item)}
                className="min-h-11 flex-1 items-center justify-center rounded-xl bg-primary"
              >
                <Text variant="label" className="font-semibold text-primary-foreground">
                  Save
                </Text>
              </TactilePressable>
            </View>
          </View>
        );
      }

      return (
        <View
          className={cn(
            "flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5",
            busy && "opacity-70",
          )}
        >
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${memberLine(item)}`}
            onPress={() => router.push(`/(admin)/organization/${item.id}` as Href)}
            className="min-w-0 flex-1 flex-row items-center gap-3"
          >
            <View className="size-10 items-center justify-center rounded-2xl bg-primary-soft">
              <Building2 color={colors.primary} size={18} />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="title" className="text-ink" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="label" className="mt-0.5 font-normal text-muted">
                {memberLine(item)}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </TactilePressable>

          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : !canManage ? null : (
            <>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Rename ${item.name}`}
                onPress={() => {
                  setRenameDraft(item.name);
                  setRenamingId(item.id);
                }}
                className="size-10 items-center justify-center rounded-full"
              >
                <Pencil color={colors.muted} size={16} />
              </TactilePressable>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name}`}
                onPress={() => confirmDelete(item)}
                className="size-10 items-center justify-center rounded-full"
              >
                <Trash2 color={colors.danger} size={16} />
              </TactilePressable>
            </>
          )}
        </View>
      );
    },
    [busyId, canManage, confirmDelete, renameDraft, renamingId, router, submitRename],
  );

  const organizations = state.status === "ready" ? state.organizations : [];

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-3 border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search organizations…"
          accessibilityLabel="Search organizations"
        />

        {composing ? (
          <View className="flex-row items-center gap-2">
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="New organization…"
              accessibilityLabel="New organization name"
              autoFocus
              maxLength={255}
              returnKeyType="done"
              onSubmitEditing={create}
              className="h-11 flex-1 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
            />
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Create organization"
              accessibilityState={{ disabled: draft.trim() === "" }}
              disabled={draft.trim() === ""}
              onPress={create}
              className={cn(
                "size-11 items-center justify-center rounded-2xl bg-primary",
                draft.trim() === "" && "opacity-50",
              )}
            >
              {busyId === "new" ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Plus color={colors.primaryForeground} size={20} />
              )}
            </TactilePressable>
          </View>
        ) : null}

        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
            {problem}
          </Text>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={organizations}
        keyExtractor={keyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={Separator}
        renderItem={renderItem}
        refreshControl={makeRefreshControl(refreshing, () => {
          setRefreshing(true);
          load(query);
        })}
        ListEmptyComponent={
          state.status === "loading" ? (
            <View className="py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="items-center px-4 py-14">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Building2 color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                {state.status === "failed" ? state.title : "No organizations"}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {state.status === "failed"
                  ? state.hint
                  : canManage
                    ? "Everything in this product belongs to one. Create the first with the button above."
                    : "Everything in this product belongs to one."}
              </Text>
              {state.status === "failed" ? (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={() => load(query)}
                  className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
                >
                  <Text variant="label" className="font-semibold text-primary-foreground">
                    Try again
                  </Text>
                </TactilePressable>
              ) : null}
            </View>
          )
        }
      />
    </View>
  );
}
