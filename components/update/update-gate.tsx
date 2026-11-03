import { ArrowUpCircle } from "lucide-react-native";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  AppState,
  BackHandler,
  Linking,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { apiRequest } from "@/lib/api-client";
import {
  APP_VERSION,
  FALLBACK_STORE_URL,
  appVersionHeaders,
  getUpdateState,
  readVersionCheck,
  setUpdateState,
  subscribeUpdateState,
} from "@/lib/app-update";
import { colors } from "@/lib/tokens";

/**
 * Asks the API whether this build is still served, and covers the whole app
 * when it is not.
 *
 * An overlay above the navigator rather than a route: a refusal can arrive on
 * any request from any screen, and a route would have to win against the role
 * guards and the Launch gate to be shown at all. It asks on mount and on every
 * return to the foreground, because the API can raise its floor while the app
 * sits in the background. A check that cannot reach the API changes nothing;
 * see `setUpdateState` for why a refusal is never lifted.
 */
export function UpdateGate() {
  const state = useSyncExternalStore(subscribeUpdateState, getUpdateState);
  const required = state.verdict === "required";

  useEffect(() => {
    // Web sends no version headers and the API would answer it 400.
    if (Object.keys(appVersionHeaders()).length === 0) return;

    const check = async () => {
      const outcome = await apiRequest("/app-version");
      if (!outcome.reached || outcome.status !== 200) return;
      const verdict = readVersionCheck(outcome.body);
      if (verdict) setUpdateState(verdict);
    };

    void check();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void check();
    });
    return () => subscription.remove();
  }, []);

  // Back would otherwise pop the stack underneath the overlay.
  useEffect(() => {
    if (!required) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [required]);

  if (!required) return null;
  return <UpdateRequiredScreen storeUrl={state.storeUrl ?? FALLBACK_STORE_URL} />;
}

function UpdateRequiredScreen({ storeUrl }: { storeUrl: string | null }) {
  const insets = useSafeAreaInsets();

  const openStore = useCallback(() => {
    if (!storeUrl) return;
    // `market:` needs the Play Store app; a phone without it gets the web page.
    Linking.openURL(storeUrl).catch(() => {
      if (storeUrl.startsWith("market://")) {
        void Linking.openURL(
          storeUrl.replace("market://", "https://play.google.com/store/apps/"),
        ).catch(() => {});
      }
    });
  }, [storeUrl]);

  return (
    <View
      style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}
      className="items-center justify-center bg-bg px-8"
      accessibilityViewIsModal
    >
      <View className="size-16 items-center justify-center rounded-3xl bg-primary-soft">
        <ArrowUpCircle color={colors.primary} size={28} />
      </View>

      <Text variant="headline" className="mt-5 text-center text-ink">
        Update ChatRoute to continue
      </Text>
      <Text
        variant="meta"
        className="mt-2 text-center text-muted"
        accessibilityLiveRegion="polite"
      >
        {storeUrl
          ? "This version is no longer supported. Install the latest version from the store to keep using the app."
          : "This version is no longer supported. Install the latest version from the App Store to keep using the app."}
      </Text>

      {storeUrl ? (
        <Button className="mt-7 min-h-12 w-full" onPress={openStore}>
          <Text>Update now</Text>
        </Button>
      ) : null}

      {APP_VERSION ? (
        <Text variant="meta" className="mt-4 text-center text-muted">
          Installed version {APP_VERSION}
        </Text>
      ) : null}
    </View>
  );
}
