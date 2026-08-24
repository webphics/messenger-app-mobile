import { AlertCircle } from "@/components/icons";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { colors, screenBottomPad } from "@/lib/tokens";

export type CatalogAddField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
};

type CatalogAddFormProps = {
  fields: CatalogAddField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
};

export function CatalogAddForm({ fields, submitLabel, onSubmit }: CatalogAddFormProps) {
  const insets = useSafeAreaInsets();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const missing = fields.find(
      (f) => f.required !== false && !values[f.key]?.trim(),
    );
    if (missing) {
      hapticWarning();
      setError(`Please enter ${missing.label.toLowerCase()}`);
      return;
    }
    setError(null);
    hapticSuccess();
    onSubmit(values);
  }

  return (
    // Shrinking the scroll viewport is what keeps a focused field above the
    // Android IME; iOS does the same natively via automaticallyAdjustKeyboardInsets.
    // `contentRef` must sit on this node: `keyboardInset` is padding *inside* its
    // frame, so measuring it stays stable across repeat keyboardDidShow events
    // and reports a bottom the host has already resized when the host resizes.
    <View
      ref={contentRef}
      collapsable={false}
      className="flex-1 bg-bg"
      style={{ paddingBottom: keyboardInset }}
    >
      <ScrollView
        {...scrollProps}
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: screenBottomPad(insets.bottom) + 24,
        }}
      >
        <View className="rounded-3xl border border-line/70 bg-surface p-5 shadow-md shadow-black/8">
          {fields.map((field, i) => (
            <View key={field.key} className={i === 0 ? "" : "mt-4"}>
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text variant="label" className="text-ink">
                  {field.label}
                </Text>
                {field.required === false ? (
                  <Text variant="label" className="text-muted">Optional</Text>
                ) : null}
              </View>
              <Input
                className={`rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink ${
                  field.multiline ? "h-28 py-3.5" : "h-12"
                }`}
                placeholder={field.placeholder}
                accessibilityLabel={field.label}
                multiline={field.multiline}
                textAlignVertical={field.multiline ? "top" : "center"}
                value={values[field.key] ?? ""}
                onChangeText={(text) => {
                  setValues((prev) => ({ ...prev, [field.key]: text }));
                  setError(null);
                }}
              />
            </View>
          ))}

          {error ? (
            <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
              <AlertCircle color={colors.danger} size={18} />
              <Text variant="meta" className="flex-1 text-danger">
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            onPress={submit}
            className="mt-6 min-h-12 w-full"
          >
            <Text>{submitLabel}</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
