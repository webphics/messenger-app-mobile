import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";

import { Archive, RotateCcw, Tag } from "@/components/icons";
import { LabelComposer } from "@/components/hub/label-composer";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import {
  createLabel,
  listLabels,
  updateLabel,
} from "@/lib/conversation-api";
import { failureNotice } from "@/lib/conversation-failure";
import {
  labelChipColors,
  orderedLabels,
  withLabel,
} from "@/lib/conversation-details";
import { colors } from "@/lib/tokens";
import type { Label, LabelColor } from "@/lib/types";

/**
 * The organization's label vocabulary.
 *
 * Offered to staff holding `manage_labels`, which both write routes check, and
 * organization-wide rather than per-thread: what a staff member does on a conversation is
 * put one of these on it, and what happens here is deciding which of them
 * exist. Two different acts, so two different places, which is also how the
 * web client splits them.
 *
 * Retiring is the delete this screen does not have, because the API does not
 * either: an archived label stays on every thread already wearing it, and is
 * offered on none. That is the only honest way to withdraw a label somebody
 * has already used to record something — and it is reversible, which is why
 * the retired ones stay listed rather than disappearing.
 *
 * Drawn in two places: the Admin Hub's Labels route, and the Manage labels
 * sheet on Conversation details, which is the way in for an Agent holding
 * `manage_labels` — the Hub is under `(admin)`, which an Agent never enters.
 */

type LabelsState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; labels: Label[] };

function keyExtractor(item: Label) {
  return item.id;
}

export function LabelsScreen({
  onChanged,
  bottomInset = 0,
}: {
  /**
   * Every label this screen created, renamed or retired, as the API answered
   * it. The sheet on Conversation details passes one, so the Labels card under
   * it offers a new label at once and stops offering a retired one.
   */
  onChanged?: (label: Label) => void;
  /** Extra space under the list, for a host that draws to the screen's bottom edge. */
  bottomInset?: number;
} = {}) {
  const [state, setState] = useState<LabelsState>({ status: "loading" });
  /** Which label has a write out for it, so its row can say it is working. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    void listLabels().then((result) => {
      if (result.ok) {
        setState({ status: "ready", labels: result.value });
        return;
      }
      const notice = failureNotice(result.failure, "Could not load labels");
      setState({ status: "failed", title: notice.title, hint: notice.hint });
    });
  }, []);

  useEffect(() => load(), [load]);

  const labels = useMemo(
    () => (state.status === "ready" ? orderedLabels(state.labels) : []),
    [state],
  );

  /** One label, replaced in place: every write here answers with the row it changed. */
  const replace = useCallback(
    (label: Label) => {
      setState((held) =>
        held.status === "ready"
          ? { status: "ready", labels: withLabel(held.labels, label) }
          : { status: "ready", labels: [label] },
      );
      onChanged?.(label);
    },
    [onChanged],
  );

  const create = useCallback(
    async (name: string, color: LabelColor) => {
      setProblem(null);
      const result = await createLabel(name, color);
      if (!result.ok) {
        return failureNotice(result.failure, "Could not create the label").hint;
      }
      replace(result.value);
      return null;
    },
    [replace],
  );

  const setArchived = useCallback(
    (label: Label, archived: boolean) => {
      setBusyId(label.id);
      setProblem(null);
      void updateLabel(label.id, { archived }).then((result) => {
        setBusyId(null);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not update the label").hint);
          return;
        }
        replace(result.value);
      });
    },
    [replace],
  );

  const confirmArchive = useCallback(
    (label: Label) => {
      Alert.alert(
        `Retire “${label.name}”?`,
        "It stays on the conversations already carrying it, and stops being offered on new ones.",
        [
          { text: "Keep", style: "cancel" },
          { text: "Retire", onPress: () => setArchived(label, true) },
        ],
      );
    },
    [setArchived],
  );

  const renderItem = useCallback(
    ({ item }: { item: Label }) => {
      const chip = labelChipColors(item.color);
      const busy = busyId === item.id;
      return (
        <View
          className={cn(
            "flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5",
            item.archived && "opacity-60",
          )}
        >
          <View
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: chip.wash }}
          >
            <Text variant="label" className="font-semibold" style={{ color: chip.ink }}>
              {item.name}
            </Text>
          </View>
          <Text variant="label" className="min-w-0 flex-1 font-normal text-muted">
            {item.archived ? "Retired" : ""}
          </Text>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={
                item.archived ? `Bring back ${item.name}` : `Retire ${item.name}`
              }
              onPress={() =>
                item.archived ? setArchived(item, false) : confirmArchive(item)
              }
              className="size-11 items-center justify-center rounded-full"
            >
              {item.archived ? (
                <RotateCcw color={colors.primary} size={18} />
              ) : (
                <Archive color={colors.muted} size={18} />
              )}
            </TactilePressable>
          )}
        </View>
      );
    },
    [busyId, confirmArchive, setArchived],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="gap-3 border-b border-line/60 bg-surface px-4 pb-3.5 pt-3">
        <LabelComposer onCreate={create} />

        {problem ? (
          <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
            {problem}
          </Text>
        ) : null}
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={labels}
        keyExtractor={keyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: 12 + bottomInset }}
        renderItem={renderItem}
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
                <Tag color={colors.primary} size={26} />
              </View>
              <Text variant="title" className="mt-4 text-ink">
                No labels yet
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Create one above, and every staff member can put it on a conversation.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
