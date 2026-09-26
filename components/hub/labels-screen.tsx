import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";

import { Archive, Plus, RotateCcw, Tag } from "@/components/icons";
import { Input } from "@/components/ui/input";
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
  LABEL_COLOR_CHOICES,
  labelChipColors,
  orderedLabels,
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
 */

type LabelsState =
  | { status: "loading" }
  | { status: "failed"; title: string; hint: string }
  | { status: "ready"; labels: Label[] };

function keyExtractor(item: Label) {
  return item.id;
}

export function LabelsScreen() {
  const [state, setState] = useState<LabelsState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [creating, setCreating] = useState(false);
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
  const replace = useCallback((label: Label) => {
    setState((held) =>
      held.status === "ready"
        ? {
            status: "ready",
            labels: held.labels.some((row) => row.id === label.id)
              ? held.labels.map((row) => (row.id === label.id ? label : row))
              : [...held.labels, label],
          }
        : { status: "ready", labels: [label] },
    );
  }, []);

  const create = useCallback(() => {
    const name = draft.trim();
    if (!name || creating) return;

    setCreating(true);
    setProblem(null);
    void createLabel(name, color).then((result) => {
      setCreating(false);
      if (!result.ok) {
        setProblem(failureNotice(result.failure, "Could not create the label").hint);
        return;
      }
      replace(result.value);
      setDraft("");
    });
  }, [color, creating, draft, replace]);

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
        <View className="flex-row items-center gap-2">
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="New label…"
            accessibilityLabel="New label name"
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={create}
            className="h-11 flex-1 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Create label"
            accessibilityState={{ disabled: draft.trim() === "" || creating }}
            disabled={draft.trim() === "" || creating}
            onPress={create}
            className={cn(
              "size-11 items-center justify-center rounded-2xl bg-primary",
              (draft.trim() === "" || creating) && "opacity-50",
            )}
          >
            {creating ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Plus color={colors.primaryForeground} size={20} />
            )}
          </TactilePressable>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {LABEL_COLOR_CHOICES.map((choice) => {
            const chip = labelChipColors(choice);
            const picked = choice === color;
            return (
              <TactilePressable
                key={choice}
                accessibilityRole="button"
                accessibilityLabel={choice}
                accessibilityState={{ selected: picked }}
                onPress={() => setColor(choice)}
                className={cn(
                  "size-9 items-center justify-center rounded-full border-2",
                  picked ? "border-ink" : "border-transparent",
                )}
                style={{ backgroundColor: chip.wash }}
              >
                <View
                  className="size-4 rounded-full"
                  style={{ backgroundColor: chip.ink }}
                />
              </TactilePressable>
            );
          })}
        </View>

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
        contentContainerClassName="gap-2.5 px-4 py-3"
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
