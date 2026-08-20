import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

import { FaqRow } from "@/components/hub/faq-row";
import { listFaqs } from "@/lib/mock-catalog";
import type { FaqItem } from "@/lib/types";

function keyExtractor(item: FaqItem) {
  return item.id;
}

function FaqSeparator() {
  return <View className="h-3" />;
}

export function FaqList() {
  const [items, setItems] = useState<FaqItem[]>(listFaqs);
  const [openId, setOpenId] = useState<string | null>(listFaqs()[0]?.id ?? null);

  useFocusEffect(
    useCallback(() => {
      const next = listFaqs();
      setItems(next);
      setOpenId((id) => (id && next.some((item) => item.id === id) ? id : next[0]?.id ?? null));
    }, []),
  );

  const toggleOpen = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FaqItem }) => (
      <FaqRow item={item} open={item.id === openId} onToggle={toggleOpen} chrome="card" />
    ),
    [openId, toggleOpen],
  );

  return (
    <FlatList
      className="flex-1 bg-bg"
      extraData={openId}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={5}
      contentContainerClassName="px-4 py-4"
      data={items}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={FaqSeparator}
      renderItem={renderItem}
    />
  );
}
