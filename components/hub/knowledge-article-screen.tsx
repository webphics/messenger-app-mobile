import { Redirect, Stack, useLocalSearchParams, usePathname } from "expo-router";

import { KnowledgeArticleView } from "@/components/hub/knowledge-article";
import { dynamicRouteId, ROLE_HREF } from "@/lib/hub-routes";
import { getKnowledge } from "@/lib/mock-catalog";
import { getSession } from "@/lib/session";

export function KnowledgeArticleScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const pathname = usePathname();
  const id = dynamicRouteId(raw, pathname, "article");
  const article = id ? getKnowledge(id) : undefined;
  if (!article) return <Redirect href={ROLE_HREF[getSession().role]} />;

  return (
    <>
      <Stack.Screen options={{ title: article.title }} />
      <KnowledgeArticleView article={article} />
    </>
  );
}
