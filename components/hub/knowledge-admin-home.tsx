import { router, useFocusEffect } from "expo-router";
import { HelpCircle, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { KnowledgeRow } from "@/components/hub/knowledge-row";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { listKnowledge } from "@/lib/mock-catalog";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

export function KnowledgeAdminHome() {
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);

  useFocusEffect(
    useCallback(() => {
      setItems(listKnowledge());
    }, []),
  );

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
    >
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add FAQ"
          onPress={() => router.push("/(admin)/faq-add")}
          className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
        >
          <Plus color={colors.primary} size={22} />
          <Text className="mt-3 font-sans text-base font-medium text-ink">Add FAQ</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add knowledge"
          onPress={() => router.push("/(admin)/knowledge-add")}
          className="min-h-24 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
        >
          <Plus color={colors.primary} size={22} />
          <Text className="mt-3 font-sans text-base font-medium text-ink">
            Add knowledge
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View FAQs"
        onPress={() => router.push("/(admin)/faq")}
        className="mt-3 min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
      >
        <HelpCircle color={colors.primary} size={22} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-medium text-ink">FAQs</Text>
        </View>
      </Pressable>

      <Text className="mt-6 font-sans text-base font-semibold text-ink">Articles</Text>
      <View className="mt-3 gap-3">
        {items.map((item) => (
          <KnowledgeRow
            key={item.id}
            article={item}
            onPress={() => router.push(knowledgeHref("admin", item.id))}
          />
        ))}
      </View>
    </ScrollView>
  );
}
