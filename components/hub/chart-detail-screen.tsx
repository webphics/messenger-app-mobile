import { Redirect, Stack, useLocalSearchParams, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { ChartDetail } from "@/components/hub/chart-detail";
import { analyticsChartById } from "@/lib/analytics-charts";
import { dynamicRouteId, ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";
import { colors } from "@/lib/tokens";
import { useAnalytics } from "@/lib/use-analytics";

/**
 * One chart, opened from the Hub's carousel.
 *
 * It reads the overview again rather than being handed the chart it was tapped
 * from: a route is reachable from a deep link and from a reload, and a screen
 * that could only be entered with its data already in hand would be blank in
 * both. `useAnalytics` is the same read the carousel made, so the common case —
 * a tap, moments later — is answered from a request this screen makes while the
 * numbers it already knows are still on the card behind it.
 *
 * A chart id that no overview produces redirects, the way it did when the ids
 * came from a fixed catalogue. It is a different condition now: a chart can be
 * missing because the id is not one of the five, or because the read has not
 * landed yet, and only the first is a wrong address — which is why the spinner
 * comes first and the redirect only once there is an answer to be absent from.
 */
export function ChartDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const pathname = usePathname();
  const id = dynamicRouteId(raw, pathname, "chart");
  const { status, charts, refreshing, refresh } = useAnalytics();

  const chart = id ? analyticsChartById(charts, id) : undefined;

  if (!chart) {
    if (status === "loading") {
      return (
        <View
          accessibilityLabel="Loading the chart"
          className="flex-1 items-center justify-center bg-bg"
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    return <Redirect href={ROLE_HREF[getSession().role]} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: chart.title }} />
      <ChartDetail chart={chart} refreshing={refreshing} onRefresh={refresh} />
    </>
  );
}
