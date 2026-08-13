import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { colors } from "@/lib/tokens";
import type { KnowledgeArticle } from "@/lib/types";

type KnowledgeRowProps = {
  article: KnowledgeArticle;
  onPress: () => void;
};

export function KnowledgeRow({ article, onPress }: KnowledgeRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={article.title}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
    >
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-medium text-ink">{article.title}</Text>
        {article.tags.length > 0 ? (
          <Text className="mt-0.5 font-sans text-sm font-normal text-muted" numberOfLines={1}>
            {article.tags.join(" · ")}
          </Text>
        ) : null}
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}
