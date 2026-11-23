import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Plus } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { LABEL_COLOR_CHOICES, labelChipColors } from "@/lib/conversation-details";
import { colors } from "@/lib/tokens";
import type { LabelColor } from "@/lib/types";

/** The API's limit on a label's name. */
export const LABEL_NAME_MAX = 40;

/**
 * A name and a colour, and the button that makes a label of them.
 *
 * One component for both places a label is created: the label manager, where
 * the new label joins the catalogue, and the Labels card on Conversation
 * details, where it is also put on the thread. What creating *means* is the
 * caller's, through `onCreate`; what this holds is the draft, so the name and
 * the swatch behave identically wherever somebody types one.
 *
 * The name is kept on a refusal, so it can be corrected rather than retyped,
 * and cleared on success, so the next one starts empty. The colour is kept
 * either way: somebody adding three billing labels wants the same hue three
 * times.
 */
export function LabelComposer({
  onCreate,
  placeholder = "New label…",
  actionLabel = "Create label",
}: {
  /** Answers the refusal to show, or null when the label was made. */
  onCreate: (name: string, color: LabelColor) => Promise<string | null>;
  placeholder?: string;
  /** The button's accessible name. */
  actionLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const blocked = draft.trim() === "" || creating;

  const create = useCallback(() => {
    const name = draft.trim();
    if (!name || creating) return;

    setCreating(true);
    setProblem(null);
    void onCreate(name, color).then((refusal) => {
      setCreating(false);
      if (refusal) {
        setProblem(refusal);
        return;
      }
      setDraft("");
    });
  }, [color, creating, draft, onCreate]);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          accessibilityLabel="New label name"
          maxLength={LABEL_NAME_MAX}
          returnKeyType="done"
          onSubmitEditing={create}
          className="h-11 flex-1 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
        />
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: blocked, busy: creating }}
          disabled={blocked}
          onPress={create}
          className={cn(
            "size-11 items-center justify-center rounded-2xl bg-primary",
            blocked && "opacity-50",
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
              <View className="size-4 rounded-full" style={{ backgroundColor: chip.ink }} />
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
  );
}
