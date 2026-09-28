import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";

import { MailPlus, Trash2, Users } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { can } from "@/lib/capabilities";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { initials } from "@/lib/display";
import { inviteToOrganizations, listOrganizationMembers, removeMembership } from "@/lib/org-api";
import { makeRefreshControl } from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import { listUsers } from "@/lib/user-api";
import { useSupportAssignment } from "@/lib/use-support-assignment";
import { useViewer } from "@/lib/use-viewer";
import { unmanageableIds, userDisplayName } from "@/lib/user-directory";
import type { ManagedUser, OrganizationMember } from "@/lib/types";

/**
 * Who is in one organization, and who could be.
 *
 * Two lists on one screen because they are one question asked twice. The
 * members are `GET /memberships/organization/:id`; the people who could be
 * invited are everybody the directory holds who is not already in it, which
 * is a client-side difference because the API has no endpoint for "not in
 * this organization".
 *
 * Inviting is the only way in — there is no route that grants a membership
 * directly. What the invite does depends on who is invited: a Customer joins at
 * once (ADR 0013), so their row crosses to the members list, while everybody
 * else stays in the second list until they accept. Removing is the opposite and
 * immediate: the API revokes the membership and reassigns whatever the loss of
 * it made unreadable, which is the `membership_revoked` reason on
 * `conversation.reassigned`.
 *
 * Inviting and removing need `manage_memberships`. Without it the screen only
 * lists the members, and the people who could be invited are left out.
 */

type MembersState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; members: OrganizationMember[] };

type Row =
  | { kind: "member"; member: OrganizationMember }
  | { kind: "candidate"; user: ManagedUser };

function keyExtractor(row: Row) {
  return row.kind === "member" ? `m-${row.member.id}` : `c-${row.user.id}`;
}

function Separator() {
  return <View className="h-2.5" />;
}

export function OrganizationMembersScreen({
  organizationId,
}: {
  organizationId: string;
}) {
  const viewer = useViewer();
  const canManage = can(viewer, "manage_memberships");
  // A Shared queue holds nothing on anybody's behalf, so there is nothing of
  // theirs to reassign and the warning does not claim there is.
  const supportAssignment = useSupportAssignment();
  const [state, setState] = useState<MembersState>({ status: "loading" });
  const [directory, setDirectory] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Who has been invited during this visit, so their row says so at once. */
  const [invited, setInvited] = useState<string[]>([]);

  const load = useCallback(() => {
    void Promise.all([
      listOrganizationMembers(organizationId),
      // The whole directory, because "could be invited" is everybody the
      // members list does not already name and the API cannot be asked that.
      listUsers({ pageSize: 200 }),
    ]).then(([members, users]) => {
      setRefreshing(false);
      if (users.ok) setDirectory(users.value);
      if (members.ok) {
        setState({ status: "ready", members: members.value });
        return;
      }
      const notice = failureNotice(members.failure, "Could not load the members");
      setState({ status: "failed", title: notice.title, hint: notice.hint });
    });
  }, [organizationId]);

  useEffect(() => load(), [load]);

  const rows = useMemo<Row[]>(() => {
    const members = state.status === "ready" ? state.members : [];
    const inside = new Set(members.map((member) => member.id));
    const q = query.trim().toLowerCase();

    const memberRows: Row[] = members
      .filter((member) => !q || member.name.toLowerCase().includes(q))
      .map((member) => ({ kind: "member", member }));

    const candidateRows: Row[] = (canManage ? directory : [])
      .filter((user) => !inside.has(user.id))
      .filter((user) => !q || userDisplayName(user).toLowerCase().includes(q))
      .map((user) => ({ kind: "candidate", user }));

    return [...memberRows, ...candidateRows];
  }, [canManage, directory, query, state]);

  const memberCount = state.status === "ready" ? state.members.length : 0;

  /**
   * The people the API will not let an Admin add or remove. A member row has
   * no flag of its own, so it is looked up in the directory loaded beside it.
   * Someone missing from that page keeps their button, and the API's refusal
   * shows through `problem` like any other.
   */
  const locked = useMemo(() => unmanageableIds(directory), [directory]);

  const invite = useCallback(
    (user: ManagedUser) => {
      setBusyId(user.id);
      setProblem(null);
      void inviteToOrganizations(user.id, [organizationId]).then((result) => {
        setBusyId(null);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not invite them").hint);
          return;
        }
        /*
         * A join moves the person into the members list, which this screen only
         * learns by asking again — the answer names organizations, not members.
         * Every other outcome ends the same way: there is now a pending
         * invitation, so the row says so and stops offering.
         */
        if (result.value.joined.length > 0) {
          load();
          return;
        }
        setInvited((held) => [...held, user.id]);
      });
    },
    [load, organizationId],
  );

  const remove = useCallback(
    (member: OrganizationMember) => {
      setBusyId(member.id);
      setProblem(null);
      void removeMembership(member.id, organizationId).then((result) => {
        setBusyId(null);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not remove them").hint);
          return;
        }
        setState((held) =>
          held.status === "ready"
            ? {
                status: "ready",
                members: held.members.filter((row) => row.id !== member.id),
              }
            : held,
        );
      });
    },
    [organizationId],
  );

  const confirmRemove = useCallback(
    (member: OrganizationMember) => {
      Alert.alert(
        `Remove ${member.name}?`,
        supportAssignment
          ? "They lose access to this organization's conversations, and anything assigned to them is reassigned."
          : "They lose access to this organization's conversations.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => remove(member),
          },
        ],
      );
    },
    [remove, supportAssignment],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "member") {
        const { member } = item;
        const busy = busyId === member.id;
        const own = viewer?.id === member.id;
        const fixed = locked.has(member.id);
        return (
          <View
            className={cn(
              "flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5",
              busy && "opacity-70",
            )}
          >
            <Avatar alt={member.name} className="size-10">
              <AvatarFallback className="bg-primary-soft">
                <Text variant="meta" className="font-bold text-primary">
                  {initials(member.name)}
                </Text>
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <Text variant="title" className="text-ink" numberOfLines={1}>
                {member.name}
              </Text>
              <Text variant="label" className="mt-0.5 font-normal capitalize text-muted">
                {member.role}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : own ? (
              /* Removing yourself from an organization on a phone is a door
                 that locks behind you; another Admin can still do it. */
              <Text variant="label" className="text-muted">
                You
              </Text>
            ) : fixed || !canManage ? null : (
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${member.name}`}
                onPress={() => confirmRemove(member)}
                className="size-10 items-center justify-center rounded-full"
              >
                <Trash2 color={colors.danger} size={16} />
              </TactilePressable>
            )}
          </View>
        );
      }

      const { user } = item;
      const name = userDisplayName(user);
      const busy = busyId === user.id;
      const sent =
        invited.includes(user.id) ||
        user.pendingInvitations.some(
          (invitation) => invitation.organization.id === organizationId,
        );

      return (
        <View
          className={cn(
            "flex-row items-center gap-3.5 rounded-2xl border border-dashed border-line px-3.5 py-3",
            busy && "opacity-70",
          )}
        >
          <View className="min-w-0 flex-1">
            <Text variant="meta" className="font-semibold text-ink-soft" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="label" className="mt-0.5 font-normal capitalize text-muted">
              {user.role}
            </Text>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : sent ? (
            <Text variant="label" className="text-muted">
              Invited
            </Text>
          ) : !user.manageable ? null : (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`Invite ${name}`}
              onPress={() => invite(user)}
              className="min-h-10 flex-row items-center gap-1.5 justify-center rounded-full border border-line/80 bg-line/35 px-3"
            >
              <MailPlus color={colors.ink} size={14} />
              <Text variant="label" className="text-ink">
                Invite
              </Text>
            </TactilePressable>
          )}
        </View>
      );
    },
    [busyId, canManage, confirmRemove, invite, invited, locked, organizationId, viewer?.id],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-2 border-b border-line/60 bg-surface px-4 pb-3.5 pt-2">
        <SearchFieldWithClear
          value={query}
          onChangeText={setQuery}
          placeholder="Search people…"
          accessibilityLabel="Search people"
        />
        <Text variant="meta" className="text-muted">
          {memberCount === 1 ? "1 member" : `${memberCount} members`}.
          {canManage ? " Everyone below the line can be invited." : ""}
        </Text>
        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
            {problem}
          </Text>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={rows}
        keyExtractor={keyExtractor}
        initialNumToRender={12}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={Separator}
        renderItem={renderItem}
        refreshControl={makeRefreshControl(refreshing, () => {
          setRefreshing(true);
          load();
        })}
        ListEmptyComponent={
          state.status === "loading" ? (
            <View className="py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="items-center px-4 py-14">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Users color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                {state.status === "failed" ? state.title : "Nobody here yet"}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {state.status === "failed"
                  ? state.hint
                  : "Invite somebody from the directory, and they join when they accept."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
