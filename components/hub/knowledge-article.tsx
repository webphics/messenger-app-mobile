import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "@/components/icons";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { hapticSuccess } from "@/lib/haptics";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeArticleViewProps = {
  article: KnowledgeArticle;
};

export function KnowledgeArticleView({ article }: KnowledgeArticleViewProps) {
  const [copied, setCopied] = useState(false);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {});

  async function onCopy() {
    await Clipboard.setStringAsync(article.body);
    hapticSuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <View className="rounded-3xl border border-line bg-surface p-5 shadow-md shadow-black/5">
        <Text variant="display" className="text-ink">
          {article.title}
        </Text>
        {article.tags.length > 0 ? (
          <View className="mt-2.5 flex-row flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <View
                key={tag}
                className="rounded-lg bg-primary-soft/80 px-2.5 py-1"
              >
                <Text variant="label" className="text-primary">
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="my-4 h-px bg-line/60" />

        <Text
          selectable
          variant="body"
          className="text-ink-soft"
        >
          {article.body}
        </Text>
      </View>

      <View className="mt-4">
        <Button
          onPress={() => void onCopy()}
          variant={copied ? "secondary" : "default"}
          className="min-h-12 flex-row items-center justify-center gap-2"
        >
          {copied ? (
            <Check color={colors.primary} size={18} />
          ) : (
            <Copy color={colors.primaryForeground} size={18} />
          )}
          <Text className={copied ? "text-primary" : "text-primary-foreground"}>
            {copied ? "Copied to clipboard" : "Copy article text"}
          </Text>
        </Button>
      </View>
    </ScrollView>
  );
}
