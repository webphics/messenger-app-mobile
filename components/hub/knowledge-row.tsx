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

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={article.title}
      onPress={handlePress}
      className="flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/5"
    >
      <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
        <BookOpen color={colors.primary} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-semibold text-ink" numberOfLines={1}>
          {article.title}
        </Text>
        {article.tags.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <View key={tag} className="rounded-md bg-bg px-2 py-0.5 border border-line/60">
                <Text className="font-sans text-[11px] font-medium text-muted">
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
