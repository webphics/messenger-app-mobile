import { Redirect, Stack, useLocalSearchParams, usePathname } from "expo-router";

import { ChartDetail } from "@/components/hub/chart-detail";
import { dynamicRouteId, ROLE_HREF } from "@/lib/hub-routes";
import { getChart } from "@/lib/mock-catalog";
import { getSession } from "@/lib/session";

export function ChartDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const pathname = usePathname();
  const id = dynamicRouteId(raw, pathname, "chart");
  const chart = id ? getChart(id) : undefined;
  if (!chart) return <Redirect href={ROLE_HREF[getSession().role]} />;

  return (
    <>
      <Stack.Screen options={{ title: chart.title }} />
      <ChartDetail chart={chart} />
    </>
  );
}
