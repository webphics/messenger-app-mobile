import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeArticleViewProps = {
  article: KnowledgeArticle;
};

export function KnowledgeArticleView({ article }: KnowledgeArticleViewProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await Clipboard.setStringAsync(article.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
    >
      <View className="rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10">
        <Text className="font-sans text-xl font-bold text-ink">{article.title}</Text>
        {article.tags.length > 0 ? (
          <Text className="mt-1 font-sans text-sm font-normal text-muted">
            {article.tags.join(" · ")}
          </Text>
        ) : null}
        <Text
          selectable
          className="mt-4 font-sans text-base font-normal leading-6 text-ink-soft"
        >
          {article.body}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy"
        onPress={() => void onCopy()}
        className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-primary px-4"
      >
        <Text className="font-sans font-semibold text-primary-foreground">
          {copied ? "Copied" : "Copy"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
