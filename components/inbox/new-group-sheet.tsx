import { Check, Users, X } from "@/components/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { createGroup } from "@/lib/conversation-api";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { initials } from "@/lib/display";
import { listOrganizations, listOrganizationMembers } from "@/lib/org-api";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { OrganizationMember, OrganizationSummary } from "@/lib/types";

/**
 * Creating a group.
 *
 * Admin only, because `POST /conversations/groups` is, and in the order the
 * API's rules force: a group belongs to exactly one organization, and its
 * members have to be in that organization — so the organization is chosen
 * first and the member list is that organization's roster rather than the
 * contact directory. Picking people before naming where they would meet is
 * what makes a refusal possible at the end instead of a choice at the start.
 *
 * The title and at least one member are required, and both are checked here
 * as well as by the API: the alternative is a sheet somebody fills in, submits
 * and has handed back with the same words in it.
 */

type NewGroupSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Handed the new group's id, so the caller can open it. */
  onCreated: (conversationId: string) => void;
};

export function NewGroupSheet({ visible, onClose, onCreated }: NewGroupSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        <GroupForm onClose={onClose} onCreated={onCreated} />
      </SafeAreaProvider>
    </Modal>
  );
}

function memberKey(item: OrganizationMember) {
  return item.id;
}

function GroupForm({ onClose, onCreated }: Omit<NewGroupSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const { addConversation } = useConversationInbox();

  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  /**
   * The roster, tagged with the organization it is for.
   *
   * Tagged rather than cleared, because clearing it is a write the effect
   * would have to make before the fetch it is about — and a roster read
   * against the wrong organization is exactly what this sheet must never
   * show. An answer for an organization nobody is looking at any more simply
   * does not match, and reads as "still loading" until the right one lands.
   */
  const [roster, setRoster] = useState<{
    organizationId: string;
    members: OrganizationMember[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listOrganizations().then((result) => {
      if (!live) return;
      if (result.ok) {
        setOrganizations(result.value);
        // One organization is not a choice: bind it and let the sheet open on
        // the roster rather than on a list of one.
        if (result.value.length === 1) setOrganizationId(result.value[0]!.id);
        return;
      }
      setOrganizations([]);
      setProblem(failureNotice(result.failure, "Could not load organizations").hint);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void listOrganizationMembers(organizationId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setRoster({ organizationId, members: result.value });
        return;
      }
      setRoster({ organizationId, members: [] });
      setProblem(failureNotice(result.failure, "Could not load members").hint);
    });
    return () => {
      live = false;
    };
  }, [organizationId]);

  const members = roster?.organizationId === organizationId ? roster.members : null;

  /** A different organization is a different roster, so nobody picked out of the last one survives. */
  const pickOrganization = useCallback((id: string) => {
    setOrganizationId(id);
    setSelected([]);
  }, []);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = members ?? [];
    if (!q) return all;
    return all.filter(
      (member) =>
        member.name.toLowerCase().includes(q) || member.role.toLowerCase().includes(q),
    );
  }, [members, query]);

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const submit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setProblem("Give the group a name.");
      return;
    }
    if (!organizationId) {
      setProblem("Pick an organization.");
      return;
    }
    if (selected.length === 0) {
      setProblem("Add at least one member.");
      return;
    }

    setBusy(true);
    setProblem(null);
    void createGroup({ title: trimmed, memberIds: selected, organizationId }).then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not create the group").hint);
          return;
        }
        addConversation(result.value);
        onClose();
        onCreated(result.value.id);
      },
    );
  }, [addConversation, onClose, onCreated, organizationId, selected, title]);

  const renderMember = useCallback(
    ({ item }: { item: OrganizationMember }) => {
      const picked = selected.includes(item.id);
      return (
        <TactilePressable
          accessibilityRole="checkbox"
          accessibilityLabel={item.name}
          accessibilityState={{ checked: picked }}
          onPress={() => toggle(item.id)}
          className={cn(
            "flex-row items-center gap-3.5 rounded-2xl border bg-surface p-3.5",
            picked ? "border-primary/50" : "border-line/70",
          )}
        >
          <Avatar alt={item.name} className="size-10">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="meta" className="font-bold text-primary">
                {initials(item.name)}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="min-w-0 flex-1">
            <Text variant="title" className="text-ink" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="label" className="mt-0.5 font-normal capitalize text-muted">
              {item.role}
            </Text>
          </View>
          <View
            className={cn(
              "size-6 items-center justify-center rounded-full border",
              picked ? "border-transparent bg-primary" : "border-line",
            )}
          >
            {picked ? <Check color={colors.primaryForeground} size={14} /> : null}
          </View>
        </TactilePressable>
      );
    },
    [selected, toggle],
  );

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Users color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            New group
          </Text>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onClose}
          className="size-9 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={18} />
        </TactilePressable>
      </View>

      <View className="gap-3 border-b border-line/40 bg-surface px-4 py-3">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Group name…"
          accessibilityLabel="Group name"
          maxLength={80}
          className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
        />

        {organizations === null ? (
          <View className="h-9 justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : organizations.length > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            {organizations.map((organization) => {
              const picked = organization.id === organizationId;
              return (
                <TactilePressable
                  key={organization.id}
                  accessibilityRole="button"
                  accessibilityLabel={organization.name}
                  accessibilityState={{ selected: picked }}
                  onPress={() => pickOrganization(organization.id)}
                  className={cn(
                    "min-h-9 justify-center rounded-full border px-3.5",
                    picked
                      ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={picked ? "text-primary-foreground" : "text-ink-soft"}
                  >
                    {organization.name}
                  </Text>
                </TactilePressable>
              );
            })}
          </View>
        ) : null}

        {organizationId ? (
          <SearchFieldWithClear
            value={query}
            onChangeText={setQuery}
            placeholder="Search members…"
            accessibilityLabel="Search members"
          />
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={visibleMembers}
        keyExtractor={memberKey}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 py-3"
        renderItem={renderMember}
        ListEmptyComponent={
          !organizationId ? (
            <Text variant="meta" className="py-10 text-center text-muted">
              Pick an organization to see who can be added.
            </Text>
          ) : members === null ? (
            <View className="py-10">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Text variant="meta" className="py-10 text-center text-muted">
              Nobody else is in this organization yet.
            </Text>
          )
        }
      />

      <View
        className="border-t border-line/60 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        {problem ? (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            className="mb-2 text-danger"
          >
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Create group"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={submit}
          className={cn(
            "min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
            busy && "opacity-70",
          )}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text variant="label" className="font-semibold text-primary-foreground">
            {selected.length === 0
              ? "Create group"
              : `Create group · ${selected.length}`}
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
