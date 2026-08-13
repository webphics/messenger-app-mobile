import { router, useFocusEffect, type Href } from "expo-router";
import { BookOpen, FileQuestion, HelpCircle, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";

import { KnowledgeRow } from "@/components/hub/knowledge-row";
import { TactilePressable } from "@/components/ui/tactile-pressable";
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
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Add FAQ"
          onPress={() => router.push("/(admin)/faq-add" as Href)}
          className="min-h-24 flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="size-10 items-center justify-center rounded-2xl bg-primary-soft">
            <Plus color={colors.primary} size={22} />
          </View>
          <Text className="mt-3 font-sans text-base font-semibold text-ink">Add FAQ</Text>
          <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
            New question
          </Text>
        </TactilePressable>

        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Add knowledge"
          onPress={() => router.push("/(admin)/knowledge-add" as Href)}
          className="min-h-24 flex-1 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        >
          <View className="size-10 items-center justify-center rounded-2xl bg-primary-soft">
            <Plus color={colors.primary} size={22} />
          </View>
          <Text className="mt-3 font-sans text-base font-semibold text-ink">
            Add Article
          </Text>
          <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
            Knowledge guide
          </Text>
        </TactilePressable>
      </View>

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="View FAQs"
        onPress={() => router.push("/(admin)/faq" as Href)}
        className="mt-3.5 flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
          <HelpCircle color={colors.primary} size={22} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-base font-semibold text-ink">
            Frequently Asked Questions
          </Text>
          <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
            Browse and manage all published FAQ answers
          </Text>
        </View>
      </TactilePressable>

      <View className="mt-6 flex-row items-center justify-between">
        <Text className="font-sans text-base font-bold text-ink">Knowledge Articles</Text>
        <View className="rounded-full bg-primary-soft px-2.5 py-0.5">
          <Text className="font-sans text-xs font-semibold text-primary">
            {items.length} articles
          </Text>
        </View>
      </View>

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
