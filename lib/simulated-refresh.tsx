import { useCallback, useRef, useState, type ReactElement } from "react";
import {
  Platform,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";

import { colors } from "@/lib/tokens";

/** Mock-phase delay so the spinner is readable (no network yet). */
export const SIMULATED_REFRESH_MS = 700;

/**
 * Delay then invoke reload. Used by the hook; testable with fake timers.
 */
export async function runSimulatedRefresh(
  onReload: () => void,
  delayMs = SIMULATED_REFRESH_MS,
): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
  onReload();
}

/**
 * Same as `runSimulatedRefresh`, but skips when `state.busy` is already true.
 * Returns whether a reload ran.
 */
export async function guardedSimulatedRefresh(
  state: { busy: boolean },
  onReload: () => void,
  delayMs = SIMULATED_REFRESH_MS,
): Promise<boolean> {
  if (state.busy) return false;
  state.busy = true;
  try {
    await runSimulatedRefresh(onReload, delayMs);
    return true;
  } finally {
    state.busy = false;
  }
}

/**
 * Pull-to-refresh state for FlatList / ScrollView. Re-entry is ignored while busy.
 */
export function useSimulatedRefresh(
  onReload: () => void,
  delayMs = SIMULATED_REFRESH_MS,
) {
  const [refreshing, setRefreshing] = useState(false);
  const gate = useRef({ busy: false });
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const onRefresh = useCallback(async () => {
    if (gate.current.busy) return;
    setRefreshing(true);
    try {
      await guardedSimulatedRefresh(
        gate.current,
        () => onReloadRef.current(),
        delayMs,
      );
    } finally {
      setRefreshing(false);
    }
  }, [delayMs]);

  return { refreshing, onRefresh };
}

type MakeRefreshControlOpts = {
  /** Invert spinner for inverted FlatLists (thread). */
  inverted?: boolean;
};

/** Primary-tinted RefreshControl shared across product scrollers. */
export function makeRefreshControl(
  refreshing: boolean,
  onRefresh: () => void,
  opts?: MakeRefreshControlOpts,
): ReactElement<RefreshControlProps> {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
      style={
        opts?.inverted && Platform.OS === "ios"
          ? { transform: [{ scaleY: -1 }] }
          : undefined
      }
    />
  );
}
