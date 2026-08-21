import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";

import { HelpCircle, Plus } from "@/components/icons";
import { ActionRow } from "@/components/hub/action-row";
import { ActionTile } from "@/components/hub/action-tile";
import { KnowledgeRow } from "@/components/hub/knowledge-row";
import { Pill } from "@/components/hub/pill";
import { Text } from "@/components/ui/text";
import { knowledgeHref } from "@/lib/hub-routes";
import { listKnowledge } from "@/lib/mock-catalog";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import type { KnowledgeArticle } from "@/lib/types";

export function KnowledgeAdminHome() {
  const [items, setItems] = useState<KnowledgeArticle[]>(listKnowledge);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setItems(listKnowledge());
  });

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
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <View className="flex-row gap-3">
        <ActionTile
          className="min-h-24"
          icon={Plus}
          title="Add FAQ"
          hint="New question"
          onPress={() => router.push("/(admin)/faq-add" as Href)}
        />
        <ActionTile
          className="min-h-24"
          icon={Plus}
          title="Add Article"
          hint="Knowledge guide"
          accessibilityLabel="Add knowledge"
          onPress={() => router.push("/(admin)/knowledge-add" as Href)}
        />
      </View>

      <ActionRow
        className="mt-3.5"
        icon={HelpCircle}
        title="Frequently Asked Questions"
        hint="Browse and manage all published FAQ answers"
        accessibilityLabel="View FAQs"
        chevron={false}
        onPress={() => router.push("/(admin)/faq" as Href)}
      />

      <View className="mt-6 flex-row items-center justify-between">
        <Text variant="title" className="text-ink">Knowledge Articles</Text>
        <Pill label={`${items.length} articles`} />
      </View>

      <View className="mt-3 gap-3">
        {items.map((item) => (
          <KnowledgeRow
            key={item.id}
            article={item}
            onPress={(articleId) => router.push(knowledgeHref("admin", articleId))}
          />
        ))}
      </View>
    </ScrollView>
  );
}
