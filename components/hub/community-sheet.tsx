import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { Users, X } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { createCommunity, updateCommunity } from "@/lib/community-admin-api";
import {
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_NAME_MAX,
  communityDraftProblem,
} from "@/lib/community-draft";
import { failureNotice } from "@/lib/conversation-failure";
import { hapticSuccess } from "@/lib/haptics";
import { listOrganizationMembers, listOrganizations } from "@/lib/org-api";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Community, OrganizationMember, OrganizationSummary } from "@/lib/types";

/**
 * Creating a Community, or editing one's name and description.
 *
 * A new Community belongs to one organization, chosen once, and its first
 * members are people from that organization: the API refuses anyone else. An
 * edit changes only the words; members, Moderators and linked Groups are managed
 * on web.
 */

type CommunitySheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The Community being edited, or null to create one. */
  community: Community | null;
  onSaved: (community: Community) => void;
};

export function CommunitySheet({ visible, ...props }: CommunitySheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <SafeAreaProvider>
        {visible ? <CommunityForm key={props.community?.id ?? "new"} {...props} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}

type MembersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; hint: string }
  | { status: "ready"; members: OrganizationMember[] };

function CommunityForm({ onClose, community, onSaved }: Omit<CommunitySheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const creating = community === null;
  const [name, setName] = useState(community?.name ?? "");
  const [description, setDescription] = useState(community?.description ?? "");
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<MembersState>({ status: "idle" });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!creating) return;
    void listOrganizations().then((result) => setOrganizations(result.ok ? result.value : []));
  }, [creating]);

  // Members come from the chosen organization; choosing another starts over.
  useEffect(() => {
    if (!organizationId) return;
    void listOrganizationMembers(organizationId).then((result) => {
      setMembers(
        result.ok
          ? { status: "ready", members: [...result.value].sort((a, b) => a.name.localeCompare(b.name)) }
          : { status: "failed", hint: failureNotice(result.failure, "Could not load members").hint },
      );
    });
  }, [organizationId]);

  const pickOrganization = (id: string) => {
    if (id === organizationId) return;
    setMembers({ status: "loading" });
    setMemberIds([]);
    setOrganizationId(id);
  };

  const visibleMembers = useMemo(() => {
    if (members.status !== "ready") return [];
    const needle = memberFilter.trim().toLowerCase();
    return needle
      ? members.members.filter((member) => member.name.toLowerCase().includes(needle))
      : members.members;
  }, [memberFilter, members]);

  const toggleMember = (id: string) =>
    setMemberIds((held) => (held.includes(id) ? held.filter((item) => item !== id) : [...held, id]));

  const submit = useCallback(() => {
    const invalid = communityDraftProblem({ name, description, creating, organizationId, memberIds });
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setBusy(true);
    setProblem(null);
    const trimmedDescription = description.trim();
    const request = community
      ? updateCommunity(community.id, {
          name: name.trim(),
          description: trimmedDescription === "" ? null : trimmedDescription,
        })
      : createCommunity({
          name: name.trim(),
          description: trimmedDescription === "" ? null : trimmedDescription,
          organizationId: organizationId as string,
          memberIds,
        });

    void request.then((result) => {
      setBusy(false);
      if (!result.ok) {
        setProblem(
          failureNotice(result.failure, community ? "Could not save the community" : "Could not create the community").hint,
        );
        return;
      }
      hapticSuccess();
      onSaved(result.value);
      onClose();
    });
  }, [community, creating, description, memberIds, name, onClose, onSaved, organizationId]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}>
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Users color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            {creating ? "New community" : "Edit community"}
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

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 18 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Name
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Riverside residents…"
            accessibilityLabel="Community name"
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            {name.trim().length}/{COMMUNITY_NAME_MAX}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Description
          </Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="What this community is for (optional)…"
            accessibilityLabel="Community description"
            multiline
            textAlignVertical="top"
            className="h-28 rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            {description.trim().length}/{COMMUNITY_DESCRIPTION_MAX}
          </Text>
        </View>

        {creating ? (
          <>
            <View className="gap-2">
              <Text variant="label" className="uppercase tracking-wide text-muted">
                Organization
              </Text>
              {organizations === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : organizations.length === 0 ? (
                <Text variant="meta" className="text-muted">
                  There are no organizations yet. Create one first: a community always belongs to one.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {organizations.map((organization) => {
                    const selected = organization.id === organizationId;
                    return (
                      <TactilePressable
                        key={organization.id}
                        accessibilityRole="radio"
                        accessibilityLabel={organization.name}
                        accessibilityState={{ checked: selected }}
                        onPress={() => pickOrganization(organization.id)}
                        className={cn(
                          "min-h-11 justify-center rounded-full border px-3.5",
                          selected ? "border-transparent bg-primary" : "border-line/80 bg-line/35",
                        )}
                      >
                        <Text variant="label" className={selected ? "text-primary-foreground" : "text-ink-soft"}>
                          {organization.name}
                        </Text>
                      </TactilePressable>
                    );
                  })}
                </View>
              )}
            </View>

            {organizationId ? (
              <View className="gap-2">
                <Text variant="label" className="uppercase tracking-wide text-muted">
                  Members{memberIds.length > 0 ? ` · ${memberIds.length} chosen` : ""}
                </Text>
                {members.status === "loading" || members.status === "idle" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : members.status === "failed" ? (
                  <Text variant="meta" className="text-danger">
                    {members.hint}
                  </Text>
                ) : members.members.length === 0 ? (
                  <Text variant="meta" className="text-muted">
                    Nobody belongs to this organization yet, so there’s nobody to add.
                  </Text>
                ) : (
                  <>
                    <SearchFieldWithClear
                      value={memberFilter}
                      onChangeText={setMemberFilter}
                      placeholder="Search members…"
                      accessibilityLabel="Search members"
                    />
                    <View className="gap-1.5">
                      {visibleMembers.map((member) => {
                        const on = memberIds.includes(member.id);
                        return (
                          <TactilePressable
                            key={member.id}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`${member.name}, ${member.role}`}
                            accessibilityState={{ checked: on }}
                            onPress={() => toggleMember(member.id)}
                            className={cn(
                              "min-h-12 flex-row items-center justify-between gap-2 rounded-xl border px-3",
                              on ? "border-primary bg-primary-soft" : "border-line/60 bg-surface",
                            )}
                          >
                            <Text variant="label" numberOfLines={1} className="min-w-0 flex-1 text-ink">
                              {member.name}
                            </Text>
                            <Text variant="label" className="font-normal capitalize text-muted">
                              {member.role}
                            </Text>
                          </TactilePressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            ) : null}
          </>
        ) : (
          <Text variant="meta" className="text-muted">
            Members, moderators and linked groups are managed on the web app.
          </Text>
        )}
      </ScrollView>

      <View className="border-t border-line/60 bg-surface px-4 pt-3" style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}>
        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="meta" className="mb-2 text-danger">
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={creating ? "Create community" : "Save changes"}
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={submit}
          className={cn("min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary", busy && "opacity-70")}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text variant="label" className="font-semibold text-primary-foreground">
            {creating ? "Create community" : "Save changes"}
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
