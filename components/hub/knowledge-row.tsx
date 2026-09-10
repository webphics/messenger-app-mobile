import { BookOpen, ChevronRight } from "@/components/icons";
import { memo, useCallback } from "react";
import { View } from "react-native";

import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeRowProps = {
  article: KnowledgeArticle;
  onPress: (articleId: string) => void;
};

export const KnowledgeRow = memo(function KnowledgeRow({
  article,
  onPress,
}: KnowledgeRowProps) {
  const handlePress = useCallback(() => {
    onPress(article.id);
  }, [article.id, onPress]);

  // No entrance: a FlatList mounts this row on every scroll into the window.
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={article.title}
      onPress={handlePress}
      className="flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8"
    >
      <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
        <BookOpen color={colors.primary} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="title" className="text-ink" numberOfLines={1}>
          {article.title}
        </Text>
        {article.tags.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <View key={tag} className="rounded-md bg-line/35 px-2 py-0.5 border border-line/80">
                <Text variant="label" className="text-muted">
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </TactilePressable>
  );
});
