import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { AudiencePicker } from "@/components/hub/audience-picker";
import { ChevronRight, Megaphone, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { createBroadcast } from "@/lib/broadcast-api";
import {
  GROUP_LOOKUP_CAP,
  chosenLabel,
  communityOption,
  groupLookupOf,
  matchingOptions,
  organizationOption,
  settleGroupLookups,
  type AudienceOption,
  type GroupLookup,
} from "@/lib/broadcast-audience";
import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  NO_AUDIENCE,
  audienceSummary,
  audienceToReuse,
  broadcastDraftProblem,
  messageProblem,
  settleAudience,
  type KnownAudience,
} from "@/lib/broadcast-draft";
import { cn } from "@/lib/cn";
import { listCommunities } from "@/lib/community-api";
import { getConversation, listContacts } from "@/lib/conversation-api";
import { failureNotice } from "@/lib/conversation-failure";
import { hapticSuccess } from "@/lib/haptics";
import { listOrganizations } from "@/lib/org-api";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import { useGroupPages } from "@/lib/use-group-pages";
import { useViewer } from "@/lib/use-viewer";
import type {
  Broadcast,
  BroadcastAudience,
  Community,
  Contact,
  OrganizationSummary,
} from "@/lib/types";

/**
 * Writing and sending a Broadcast, in two steps: the message, then who it goes
 * to and how. Each kind of audience is chosen in a picker drawn in place of the
 * step, the way the web wizard opens a dialog per kind.
 *
 * #25 shaped it. The composer used to draw every organization, community and
 * group as an animated chip in one scroll view beside the inputs, with the
 * groups read out of the whole inbox. On an Admin's phone that was thousands of
 * animated nodes inside a sheet still sliding up, re-rendered on every
 * keystroke and every socket event, and it froze and then went white. Now the
 * message step draws two inputs and nothing else, nothing is fetched until the
 * sheet has finished presenting, the pickers are virtualised lists, and the
 * groups come a page at a time from the API (`useGroupPages`).
 *
 * The audience is organizations, communities and groups, the three that name a
 * set of people at once. Picking people one by one stays on web, where the full
 * directory is searchable. A reused audience still lists the people it named, so
 * they can be reviewed and taken out here.
 *
 * Reusing carries the audience and nothing else. The message is new, and both
 * delivery switches start off.
 *
 * Essential and acknowledgement are spelled out in what they do rather than
 * what they are called, because both reach people who turned announcements off,
 * and an Admin choosing one should know that before they send.
 */

type ComposeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSent: (broadcast: Broadcast) => void;
  /** The earlier Broadcast whose audience this one starts from. */
  reuseFrom?: Broadcast;
};

export function BroadcastComposeSheet({ visible, onClose, onSent, reuseFrom }: ComposeSheetProps) {
  // Set once the sheet has finished sliding up; nothing is fetched before then.
  const [presented, setPresented] = useState(false);
  const close = useCallback(() => {
    setPresented(false);
    onClose();
  }, [onClose]);
  // What Android's Back and iOS's swipe-down do, which the form sets: with a picker open
  // they close the picker, so a stray gesture never throws away the message and audience.
  const backRef = useRef<() => void>(close);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={() => setPresented(true)}
      onRequestClose={() => backRef.current()}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        {visible ? (
          <ComposeForm
            presented={presented}
            backRef={backRef}
            onClose={close}
            onSent={onSent}
            reuseFrom={reuseFrom}
          />
        ) : null}
      </SafeAreaProvider>
    </Modal>
  );
}

type AudienceKind = keyof BroadcastAudience;

/** How each kind is named, in its picker and on the Audience step. */
const KINDS: Record<
  AudienceKind,
  { heading: string; one: string; many: string; search: string; none: string; noMatch: string }
> = {
  organizationIds: {
    heading: "Organizations",
    one: "organization",
    many: "organizations",
    search: "Search organizations…",
    none: "There are no organizations yet.",
    noMatch: "No organization matches.",
  },
  communityIds: {
    heading: "Communities",
    one: "community",
    many: "communities",
    search: "Search communities…",
    none: "There are no communities yet.",
    noMatch: "No community matches.",
  },
  groupIds: {
    heading: "Groups",
    one: "group",
    many: "groups",
    search: "Search groups…",
    none: "There are no groups yet.",
    noMatch: "No group matches.",
  },
  userIds: {
    heading: "People",
    one: "person",
    many: "people",
    search: "Search people…",
    none: "These people are no longer available.",
    noMatch: "No person matches.",
  },
};

const LOOKUP_BATCH = 4;

/** Looks up reused groups a few at a time, so a long reuse never fans out at once. */
async function lookUpGroups(ids: readonly string[]): Promise<GroupLookup[]> {
  const lookups: GroupLookup[] = [];
  for (let start = 0; start < ids.length; start += LOOKUP_BATCH) {
    const batch = ids.slice(start, start + LOOKUP_BATCH);
    const results = await Promise.all(batch.map((id) => getConversation(id)));
    results.forEach((result, index) => lookups.push(groupLookupOf(batch[index], result)));
  }
  return lookups;
}

/**
 * Whether a reused audience's groups are looked up one by one. Past the cap they
 * are not, and count as unknown: nothing is removed, and the API ignores a group
 * that has gone.
 */
function looksUpGroups(reuseFrom: Broadcast | undefined, seed: BroadcastAudience): boolean {
  return reuseFrom !== undefined && seed.groupIds.length > 0 && seed.groupIds.length <= GROUP_LOOKUP_CAP;
}

function ComposeForm({
  presented,
  backRef,
  onClose,
  onSent,
  reuseFrom,
}: Omit<ComposeSheetProps, "visible"> & {
  presented: boolean;
  backRef: RefObject<() => void>;
}) {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const [seed] = useState<BroadcastAudience>(() =>
    reuseFrom ? audienceToReuse(reuseFrom.audience, viewer?.id ?? null) : NO_AUDIENCE,
  );
  const [step, setStep] = useState<"message" | "audience">("message");
  const [picking, setPicking] = useState<AudienceKind | null>(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [picked, setAudience] = useState<BroadcastAudience>(seed);
  const [essential, setEssential] = useState(false);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [people, setPeople] = useState<Contact[] | null>(seed.userIds.length > 0 ? null : []);
  // A list that failed is empty on screen but says nothing about what still exists.
  const [listsRead, setListsRead] = useState({
    organizations: false,
    communities: false,
    people: false,
  });
  // Reused groups, looked up by id: the group list is paged, so it cannot say what is gone.
  const [groupCheck, setGroupCheck] = useState<{
    done: boolean;
    known: ReadonlySet<string> | null;
  }>(() => ({ done: !looksUpGroups(reuseFrom, seed), known: null }));
  // Names learned from pickers and lookups, for what the lists below do not hold.
  const [learnedNames, setLearnedNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const readOrganizations = useCallback(() => {
    void listOrganizations().then((result) => {
      setOrganizations(result.ok ? result.value : []);
      setListsRead((held) => ({ ...held, organizations: result.ok }));
    });
  }, []);
  const readCommunities = useCallback(() => {
    void listCommunities().then((result) => {
      setCommunities(result.ok ? result.value : []);
      setListsRead((held) => ({ ...held, communities: result.ok }));
    });
  }, []);
  const retryOrganizations = useCallback(() => {
    setOrganizations(null);
    readOrganizations();
  }, [readOrganizations]);
  const retryCommunities = useCallback(() => {
    setCommunities(null);
    readCommunities();
  }, [readCommunities]);

  // Each list failing leaves its picker saying so; the others still work.
  useEffect(() => {
    if (!presented) return;
    readOrganizations();
    readCommunities();
    if (seed.userIds.length > 0) {
      void listContacts().then((result) => {
        setPeople(result.ok ? result.value : []);
        setListsRead((held) => ({ ...held, people: result.ok }));
      });
    }
    if (!looksUpGroups(reuseFrom, seed)) return;
    void lookUpGroups(seed.groupIds).then((lookups) => {
      const settled = settleGroupLookups(seed.groupIds.length, lookups);
      setLearnedNames((held) => new Map([...held, ...settled.names]));
      setGroupCheck({ done: true, known: settled.known });
    });
  }, [presented, readCommunities, readOrganizations, reuseFrom, seed]);

  const organizationOptions = useMemo<AudienceOption[]>(
    () => (organizations ?? []).map(organizationOption),
    [organizations],
  );
  const communityOptions = useMemo<AudienceOption[]>(
    () => (communities ?? []).map(communityOption),
    [communities],
  );
  // Only the people the earlier Broadcast named, which stay listed once taken out.
  const peopleOptions = useMemo<AudienceOption[]>(() => {
    const named = new Set(seed.userIds);
    return (people ?? [])
      .filter((person) => named.has(person.id))
      .map((person) => ({ id: person.id, name: person.name, meta: null }));
  }, [people, seed]);

  const names = useMemo(() => {
    const all = new Map(learnedNames);
    for (const option of [...organizationOptions, ...communityOptions, ...peopleOptions]) {
      all.set(option.id, option.name);
    }
    return all;
  }, [communityOptions, learnedNames, organizationOptions, peopleOptions]);

  const known = useMemo<KnownAudience>(
    () => ({
      userIds: listsRead.people ? new Set((people ?? []).map((person) => person.id)) : null,
      groupIds: groupCheck.known,
      communityIds: listsRead.communities
        ? new Set((communities ?? []).map((community) => community.id))
        : null,
      organizationIds: listsRead.organizations
        ? new Set((organizations ?? []).map((organization) => organization.id))
        : null,
    }),
    [communities, groupCheck.known, listsRead, organizations, people],
  );
  // Whatever was deleted since the earlier send is left out of everything below.
  const { audience, unavailableCount } = useMemo(
    () =>
      reuseFrom ? settleAudience(picked, known) : { audience: picked, unavailableCount: 0 },
    [known, picked, reuseFrom],
  );
  const checkingAudience =
    reuseFrom !== undefined &&
    (organizations === null || communities === null || people === null || !groupCheck.done);

  const groups = useGroupPages(picking === "groupIds", search);
  const localOptions =
    picking === "organizationIds"
      ? organizationOptions
      : picking === "communityIds"
        ? communityOptions
        : peopleOptions;
  const filteredOptions = useMemo(
    () => matchingOptions(localOptions, search),
    [localOptions, search],
  );

  const openPicker = useCallback((kind: AudienceKind) => {
    setSearch("");
    setPicking(kind);
  }, []);
  const closePicker = useCallback(() => {
    setPicking(null);
    setSearch("");
  }, []);
  useEffect(() => {
    backRef.current = picking === null ? onClose : closePicker;
  }, [backRef, closePicker, onClose, picking]);
  const commitPicker = useCallback(
    (ids: string[], drawn: ReadonlyMap<string, string>) => {
      if (picking === null) return;
      setAudience((held) => ({ ...held, [picking]: ids }));
      setLearnedNames((held) => {
        const next = new Map(held);
        for (const id of ids) {
          const name = drawn.get(id);
          if (name !== undefined) next.set(id, name);
        }
        return next;
      });
      setProblem(null);
      closePicker();
    },
    [closePicker, picking],
  );

  const next = useCallback(() => {
    const invalid = messageProblem({ title, body });
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    setStep("audience");
  }, [body, title]);

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

  const topPad = Math.max(screenTopPad(insets.top), 16);

  if (picking !== null) {
    const kind = KINDS[picking];
    const isGroups = picking === "groupIds";
    const localStatus: "loading" | "ready" | "failed" =
      picking === "organizationIds"
        ? organizations === null
          ? "loading"
          : listsRead.organizations
            ? "ready"
            : "failed"
        : picking === "communityIds"
          ? communities === null
            ? "loading"
            : listsRead.communities
              ? "ready"
              : "failed"
          : people === null
            ? "loading"
            : "ready";
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-bg"
        style={{ paddingTop: topPad }}
      >
        <AudiencePicker
          key={picking}
          title={kind.heading}
          searchPlaceholder={kind.search}
          search={search}
          onSearchChange={setSearch}
          options={isGroups ? groups.options : filteredOptions}
          status={isGroups ? groups.status : localStatus}
          emptyHint={(searching) =>
            searching
              ? kind.noMatch
              : picking === "userIds" && !listsRead.people
                ? "Names could not be loaded. These people stay selected."
                : kind.none
          }
          failedHint={`${kind.heading} could not be loaded.`}
          onRetry={
            isGroups
              ? groups.retry
              : picking === "organizationIds"
                ? retryOrganizations
                : picking === "communityIds"
                  ? retryCommunities
                  : undefined
          }
          loadingMore={isGroups && groups.loadingMore}
          onEndReached={isGroups ? groups.loadMore : undefined}
          moreFailed={isGroups && groups.moreFailed}
          initial={audience[picking]}
          onCancel={closePicker}
          onDone={commitPicker}
        />
      </KeyboardAvoidingView>
    );
  }

  const shownKinds: AudienceKind[] = ["organizationIds", "communityIds", "groupIds"];
  if (seed.userIds.length > 0) shownKinds.push("userIds");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
      style={{ paddingTop: topPad }}
    >
      <View className="flex-row items-center justify-between gap-3 border-b border-line/60 bg-surface px-4 pb-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Megaphone color={colors.primary} size={18} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="headline" className="text-ink" numberOfLines={1}>
              {reuseFrom ? "Send another broadcast" : "New broadcast"}
            </Text>
            <Text variant="meta" className="text-muted">
              {step === "message" ? "Step 1 of 2 · Message" : "Step 2 of 2 · Audience"}
            </Text>
          </View>
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
        {step === "message" ? (
          <>
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
          </>
        ) : (
          <>
            <View className="gap-1 rounded-2xl border border-line/70 bg-surface p-3.5">
              <Text variant="label" className="font-semibold text-ink" numberOfLines={2}>
                {title.trim()}
              </Text>
              <Text variant="meta" className="text-ink-soft" numberOfLines={3}>
                {body.trim()}
              </Text>
            </View>

            <View className="gap-2">
              <Text variant="label" className="uppercase tracking-wide text-muted">
                Audience
              </Text>
              {reuseFrom ? (
                <View className="gap-1 rounded-2xl border border-line/70 bg-surface p-3.5">
                  <Text variant="meta" className="text-ink-soft">
                    Copied from “{reuseFrom.title}”. Groups, communities and organizations go to
                    their current members.
                  </Text>
                  {unavailableCount > 0 ? (
                    <Text variant="meta" className="text-muted">
                      {unavailableCount === 1
                        ? "1 selection is no longer available and was left out."
                        : `${unavailableCount} selections are no longer available and were left out.`}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View className="overflow-hidden rounded-2xl border border-line/70 bg-surface">
                {shownKinds.map((kind, index) => (
                  <AudienceKindRow
                    key={kind}
                    kind={kind}
                    first={index === 0}
                    label={
                      checkingAudience && audience[kind].length > 0
                        ? "Loading…"
                        : chosenLabel(audience[kind], names, KINDS[kind])
                    }
                    count={audience[kind].length}
                    onOpen={openPicker}
                  />
                ))}
              </View>
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
          </>
        )}
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
        {step === "message" ? (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Next: choose the audience"
            onPress={next}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary"
          >
            <Text variant="label" className="font-semibold text-primary-foreground">
              Next: audience
            </Text>
          </TactilePressable>
        ) : (
          <View className="flex-row gap-2">
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Back to the message"
              disabled={busy}
              onPress={() => {
                setProblem(null);
                setStep("message");
              }}
              className="min-h-12 items-center justify-center rounded-2xl border border-line/80 px-4"
            >
              <Text variant="label" className="text-ink">
                Back
              </Text>
            </TactilePressable>
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Send broadcast"
              accessibilityState={{ busy: busy || checkingAudience, disabled: busy || checkingAudience }}
              disabled={busy || checkingAudience}
              onPress={send}
              className={cn(
                "min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
                (busy || checkingAudience) && "opacity-70",
              )}
            >
              {busy || checkingAudience ? <ActivityIndicator color={colors.primaryForeground} /> : null}
              <Text variant="label" className="font-semibold text-primary-foreground">
                Send broadcast
              </Text>
            </TactilePressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** One kind of audience on the Audience step: what is chosen, and the way into its picker. */
function AudienceKindRow({
  kind,
  first,
  label,
  count,
  onOpen,
}: {
  kind: AudienceKind;
  first: boolean;
  label: string;
  count: number;
  onOpen: (kind: AudienceKind) => void;
}) {
  const heading = KINDS[kind].heading;
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${count > 0 ? label : "none chosen"}`}
      accessibilityHint={`Opens the list of ${heading.toLowerCase()}`}
      onPress={() => onOpen(kind)}
      className={cn(
        "min-h-14 flex-row items-center gap-3 px-3.5 py-2.5",
        !first && "border-t border-line/60",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" className="font-semibold text-ink">
          {heading}
        </Text>
        <Text variant="meta" numberOfLines={1} className={count > 0 ? "text-ink-soft" : "text-muted"}>
          {label}
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </TactilePressable>
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
