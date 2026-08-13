import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

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
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const missing = fields.find(
      (f) => f.required !== false && !values[f.key]?.trim(),
    );
    if (missing) {
      setError(`Enter ${missing.label.toLowerCase()}`);
      return;
    }
    setError(null);
    onSubmit(values);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4 py-4"
    >
      <View className="rounded-2xl border border-line bg-surface p-4">
        {fields.map((field, i) => (
          <View key={field.key} className={i === 0 ? "" : "mt-3"}>
            <Text className="mb-1.5 font-sans text-sm font-medium text-ink">
              {field.label}
            </Text>
            <Input
              className={`rounded-xl border-line bg-bg ${field.multiline ? "h-28 py-3" : "h-11"}`}
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
          <Text className="mt-2 font-sans text-sm font-normal text-danger">{error}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          onPress={submit}
          className="mt-4 min-h-12 items-center justify-center rounded-xl bg-primary px-4"
        >
          <Text className="font-sans font-semibold text-primary-foreground">
            {submitLabel}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
