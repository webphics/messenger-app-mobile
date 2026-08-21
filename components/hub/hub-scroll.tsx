import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { screenBottomPad, screenTopPad } from "@/lib/tokens";

type HubScrollProps = {
  children: ReactNode;
  /** Extra content gap below the system nav inset. */
  bottomExtra?: number;
};

/**
 * Headerless hub scroller. Owns the safe-area padding so each role hub does not
 * repeat the inset math — see the Android inset rules in AGENTS.md.
 * Pull-to-refresh is always on (mock-phase spinner; hubs re-read fixtures on next paint).
 */
export function HubScroll({ children, bottomExtra = 24 }: HubScrollProps) {
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {
    // Module fixtures are immutable; spinner alone matches Messenger UX in Phase 2.
  });

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: screenTopPad(insets.top),
        paddingBottom: screenBottomPad(insets.bottom, bottomExtra),
      }}
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      {children}
    </ScrollView>
  );
}
