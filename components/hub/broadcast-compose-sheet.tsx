import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, Switch, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { Megaphone, X } from "@/components/icons";
import { SearchFieldWithClear } from "@/components/search-field-with-clear";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { createBroadcast } from "@/lib/broadcast-api";
import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  NO_AUDIENCE,
  audienceSummary,
  broadcastDraftProblem,
  toggleAudience,
} from "@/lib/broadcast-draft";
import { cn } from "@/lib/cn";
import { listCommunities } from "@/lib/community-api";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { failureNotice } from "@/lib/conversation-failure";
import { hapticSuccess } from "@/lib/haptics";
import { listOrganizations } from "@/lib/org-api";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import type { Broadcast, BroadcastAudience, Community, OrganizationSummary } from "@/lib/types";

/**
 * Writing and sending a Broadcast.
 *
 * The audience is organizations, communities and groups, the three that name a
 * set of people at once. Picking people one by one stays on web, where the full
 * directory is searchable.
 *
 * Essential and acknowledgement are spelled out in what they do rather than
 * what they are called, because both reach people who turned announcements off,
 * and an Admin choosing one should know that before they send.
 */

type ComposeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSent: (broadcast: Broadcast) => void;
};

export function BroadcastComposeSheet({ visible, onClose, onSent }: ComposeSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        {visible ? <ComposeForm onClose={onClose} onSent={onSent} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}

type Option = { id: string; name: string; meta: string | null };

function ComposeForm({ onClose, onSent }: Omit<ComposeSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const inbox = useConversationInbox();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>(NO_AUDIENCE);
  const [essential, setEssential] = useState(false);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [filter, setFilter] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Either list failing leaves that section saying so; the others still work.
  useEffect(() => {
    void listOrganizations().then((result) => setOrganizations(result.ok ? result.value : []));
    void listCommunities().then((result) => setCommunities(result.ok ? result.value : []));
  }, []);

  const organizationOptions = useMemo<Option[]>(
    () =>
      (organizations ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name,
        meta: `${organization.memberCount} ${organization.memberCount === 1 ? "member" : "members"}`,
      })),
    [organizations],
  );
  const communityOptions = useMemo<Option[]>(
    () =>
      (communities ?? []).map((community) => ({
        id: community.id,
        name: community.name,
        meta: `${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`,
      })),
    [communities],
  );
  // The groups this Admin's list already holds; an Admin's list is every group.
  const groupOptions = useMemo<Option[]>(() => {
    if (inbox.status !== "ready") return [];
    return inbox.conversations
      .filter((conversation) => conversation.type === "group")
      .map((conversation) => ({
        id: conversation.id,
        name: ("title" in conversation && conversation.title) || "Untitled group",
        meta: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inbox]);

  const send = useCallback(() => {
    const invalid = broadcastDraftProblem({ title, body, audience });
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);

    const reach = [
      essential || requiresAcknowledgement
        ? "It also reaches people who turned announcements off."
        : "People who turned announcements off won't get it.",
      requiresAcknowledgement ? "Each person must confirm they've read it." : null,
      "A sent announcement can't be taken back.",
    ]
      .filter(Boolean)
      .join(" ");

    Alert.alert("Send this announcement?", `To ${audienceSummary(audience)}. ${reach}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: () => {
          setBusy(true);
          void createBroadcast({
            title: title.trim(),
            body: body.trim(),
            essential,
            requiresAcknowledgement,
            audience,
          }).then((result) => {
            setBusy(false);
            if (!result.ok) {
              if (result.failure.kind === "refused" && result.failure.code === "broadcast_audience_empty") {
                setProblem(
                  "Everyone you chose has turned off announcements. Mark it essential, or choose more people.",
                );
                return;
              }
              setProblem(failureNotice(result.failure, "Could not send the announcement").hint);
              return;
            }
            hapticSuccess();
            onSent(result.value);
            onClose();
          });
        },
      },
    ]);
  }, [audience, body, essential, onClose, onSent, requiresAcknowledgement, title]);

  const needle = filter.trim().toLowerCase();
  const matches = (option: Option) => !needle || option.name.toLowerCase().includes(needle);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}>
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Megaphone color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            New broadcast
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
            Title
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Scheduled maintenance on Friday…"
            accessibilityLabel="Title"
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            {title.trim().length}/{BROADCAST_TITLE_MAX}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Message
          </Text>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder="What people need to know…"
            accessibilityLabel="Message"
            multiline
            textAlignVertical="top"
            className="h-40 rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink"
          />
          <Text variant="label" className="font-normal text-muted">
            {body.trim().length}/{BROADCAST_BODY_MAX}
          </Text>
        </View>

        <View className="gap-3">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Audience
          </Text>
          <SearchFieldWithClear
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter organizations, communities, groups…"
            accessibilityLabel="Filter audience"
          />
          <AudienceSection
            heading="Organizations"
            loading={organizations === null}
            options={organizationOptions.filter(matches)}
            selected={audience.organizationIds}
            emptyHint={needle ? "No organization matches." : "There are no organizations yet."}
            onToggle={(id) => setAudience((held) => toggleAudience(held, "organizationIds", id))}
          />
          <AudienceSection
            heading="Communities"
            loading={communities === null}
            options={communityOptions.filter(matches)}
            selected={audience.communityIds}
            emptyHint={needle ? "No community matches." : "There are no communities yet."}
            onToggle={(id) => setAudience((held) => toggleAudience(held, "communityIds", id))}
          />
          <AudienceSection
            heading="Groups"
            loading={inbox.status !== "ready"}
            options={groupOptions.filter(matches)}
            selected={audience.groupIds}
            emptyHint={needle ? "No group matches." : "There are no groups yet."}
            onToggle={(id) => setAudience((held) => toggleAudience(held, "groupIds", id))}
          />
          <Text variant="meta" className="text-ink-soft">
            Sending to: {audienceSummary(audience)}
          </Text>
        </View>

        <View className="gap-1">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Delivery
          </Text>
          <ToggleRow
            label="Essential"
            hint="Also reaches people who turned announcements off. Use it only for service, safety or legal notices."
            value={essential}
            onChange={setEssential}
          />
          <ToggleRow
            label="Require acknowledgement"
            hint="Each person must confirm they've read it before they can keep using the app. It also reaches people who turned announcements off."
            value={requiresAcknowledgement}
            onChange={setRequiresAcknowledgement}
          />
        </View>
      </ScrollView>

      <View
        className="border-t border-line/60 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="meta" className="mb-2 text-danger">
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Send broadcast"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={send}
          className={cn(
            "min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
            busy && "opacity-70",
          )}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text variant="label" className="font-semibold text-primary-foreground">
            Send broadcast
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}

function AudienceSection({
  heading,
  loading,
  options,
  selected,
  emptyHint,
  onToggle,
}: {
  heading: string;
  loading: boolean;
  options: Option[];
  selected: readonly string[];
  emptyHint: string;
  onToggle: (id: string) => void;
}) {
  const picked = options.filter((option) => selected.includes(option.id)).length;
  return (
    <View className="gap-2">
      <Text variant="label" className="text-ink-soft">
        {heading}
        {selected.length > 0 ? ` · ${selected.length} chosen` : ""}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : options.length === 0 ? (
        <Text variant="meta" className="text-muted">
          {emptyHint}
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2" accessibilityHint={`${picked} chosen`}>
          {options.map((option) => {
            const on = selected.includes(option.id);
            return (
              <TactilePressable
                key={option.id}
                accessibilityRole="checkbox"
                accessibilityLabel={option.meta ? `${option.name}, ${option.meta}` : option.name}
                accessibilityState={{ checked: on }}
                onPress={() => onToggle(option.id)}
                className={cn(
                  "min-h-11 max-w-full justify-center rounded-full border px-3.5",
                  on ? "border-transparent bg-primary" : "border-line/80 bg-line/35",
                )}
              >
                <Text
                  variant="label"
                  numberOfLines={1}
                  className={on ? "text-primary-foreground" : "text-ink-soft"}
                >
                  {option.name}
                  {option.meta ? (
                    <Text
                      variant="label"
                      className={cn("font-normal", on ? "text-primary-foreground" : "text-muted")}
                    >
                      {` · ${option.meta}`}
                    </Text>
                  ) : null}
                </Text>
              </TactilePressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <TactilePressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      className="min-h-14 flex-row items-center gap-3 py-2"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" className="font-semibold text-ink">
          {label}
        </Text>
        <Text variant="meta" className="text-muted">
          {hint}
        </Text>
      </View>
      {/* The row is the control; the switch is its picture of the state. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          trackColor={{ false: colors.line, true: colors.primary }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.line}
        />
      </View>
    </TactilePressable>
  );
}
