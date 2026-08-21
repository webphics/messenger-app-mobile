import { useFocusEffect } from "expo-router";
import { HelpCircle, Search } from "@/components/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, TextInput, View } from "react-native";

import { FaqRow } from "@/components/hub/faq-row";
import { HelpSearchField } from "@/components/hub/help-search-field";
import { InScreenHeader } from "@/components/in-screen-header";
import { Text } from "@/components/ui/text";
import { filterFaq } from "@/lib/faq-filter";
import { listFaqs } from "@/lib/mock-catalog";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";
import type { FaqItem } from "@/lib/types";

function keyExtractor(item: FaqItem) {
  return item.id;
}

export function HelpSearchScreen() {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>(listFaqs);
  const results = useMemo(() => filterFaq(faqs, query), [faqs, query]);
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    setFaqs(listFaqs());
  });

  useFocusEffect(
    useCallback(() => {
      setFaqs(listFaqs());
    }, []),
  );

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  const toggleOpen = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FaqItem }) => (
      <FaqRow item={item} open={item.id === openId} onToggle={toggleOpen} chrome="search" />
    ),
    [openId, toggleOpen],
  );

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <HelpSearchField ref={inputRef} onQuery={setQuery} placeholder="Search help & FAQs…" />
      </InScreenHeader>
      <FlatList
        className="flex-1 bg-bg"
        extraData={openId}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={keyExtractor}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerClassName="px-4 py-3 gap-3"
        ListEmptyComponent={
          query.trim() ? (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <Search color={colors.primary} size={26} />
              </View>
              <Text className="mt-4 font-sans text-base font-semibold text-ink">
                No matching answers
              </Text>
              <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
                Try different keywords or browse our FAQ section.
              </Text>
            </View>
          ) : (
            <View className="items-center px-4 py-12">
              <View className="size-14 items-center justify-center rounded-full bg-primary-soft">
                <HelpCircle color={colors.primary} size={26} />
              </View>
              <Text className="mt-4 font-sans text-base font-semibold text-ink">
                Search Help & FAQs
              </Text>
              <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
                Find quick answers to common questions.
              </Text>
            </View>
          )
        }
        renderItem={renderItem}
        refreshControl={makeRefreshControl(refreshing, onRefresh)}
      />
    </View>
  );
}
