import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type ViewInstance,
  type ScrollViewInstance,
} from "react-native";
import Constants, { AppOwnership } from "expo-constants";

/** Gap left between a focused field and the top of the keyboard. */
export const FOCUS_REVEAL_MARGIN = 16;

/**
 * Expo Go still honors `softwareKeyboardLayoutMode: "resize"` (and/or applies
 * IME window insets). Our edge-to-edge MainActivity does not — so JS must lift
 * the composer only outside Expo Go. Using StoreClient would also hit
 * expo-dev-client builds that ship our plugin; `appOwnership === expo` is Go only.
 */
export function hostResizesForKeyboard(): boolean {
  return (
    Platform.OS === "android" && Constants.appOwnership === AppOwnership.Expo
  );
}

/**
 * Residual overlap after any host resize/IME pad.
 * `contentBottomInWindow` from `measureInWindow`; `keyboardTop` from
 * `endCoordinates.screenY`. Cap by reported height so a coordinate mismatch
 * cannot invent a pad larger than the IME.
 */
export function residualKeyboardOverlap(
  contentBottomInWindow: number,
  keyboardTop: number,
  reportedHeight: number,
): number {
  const height = Math.max(0, reportedHeight);
  const geometric = Math.max(0, contentBottomInWindow - keyboardTop);
  return Math.min(height, geometric);
}

/**
 * How far the keyboard overlaps laid-out content, in dp.
 *
 * Prefer residual geometry when a content bottom is supplied. Raw height alone
 * double-pads any host that already resized or IME-padded the window (Expo Go).
 */
export function keyboardOverlap(
  event: KeyboardEvent | null | undefined,
  contentBottomInWindow?: number,
): number {
  const coords = event?.endCoordinates;
  if (!coords) return 0;
  const height = Math.max(0, coords.height);
  if (contentBottomInWindow == null) return height;
  return residualKeyboardOverlap(contentBottomInWindow, coords.screenY, height);
}

/** How far to scroll so `inputBottom` clears `viewportBottom`. */
export function revealScrollDelta(
  inputBottom: number,
  viewportBottom: number,
  margin: number = FOCUS_REVEAL_MARGIN,
): number {
  return Math.max(0, inputBottom + margin - viewportBottom);
}

function readOverlapFromEvent(
  event: KeyboardEvent,
  contentRef: React.RefObject<ViewInstance | null> | undefined,
  apply: (next: number) => void,
) {
  if (hostResizesForKeyboard()) {
    apply(0);
    return;
  }

  const node = contentRef?.current;
  const fallback = () => {
    const windowH = Dimensions.get("window").height;
    apply(
      residualKeyboardOverlap(
        windowH,
        event.endCoordinates.screenY,
        event.endCoordinates.height,
      ),
    );
  };

  if (!node) {
    fallback();
    return;
  }

  node.measureInWindow((_x, y, _w, h) => {
    apply(keyboardOverlap(event, y + h));
  });
}

/**
 * Keyboard overlap as a live value.
 *
 * Pass `contentRef` to the view that fills the area above the IME *before*
 * this inset is applied (same node may receive `paddingBottom` — measure runs
 * while inset is still 0). Expo Go skips the lift entirely.
 *
 * `KeyboardAvoidingView` cannot do this job here: it subtracts
 * `keyboardFrame.screenY` from a parent-relative `onLayout` frame under
 * edge-to-edge and settles a status-bar height too low.
 */
export function useKeyboardInset(
  contentRef?: React.RefObject<ViewInstance | null>,
): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      // Two frames: Expo Go / resize hosts finish window layout first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          readOverlapFromEvent(event, contentRef, setInset);
        });
      });
    };
    const onHide = () => setInset(0);

    const subs =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", onShow),
            Keyboard.addListener("keyboardWillHide", onHide),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", onShow),
            Keyboard.addListener("keyboardDidHide", onHide),
          ];
    return () => subs.forEach((sub) => sub.remove());
  }, [contentRef]);

  return inset;
}

/**
 * Keyboard lift for a bottom sheet drawn inside a `Modal`.
 *
 * The sheets wrap themselves in an iOS-only `KeyboardAvoidingView`, which is
 * all iOS needs. On Android a Modal is its own window and edge-to-edge stops
 * it resizing for the IME, so the field sits under the keyboard unless
 * something lifts it. Put `ref` on the backdrop that fills the modal and
 * apply `keyboardInset` to it as `paddingBottom`.
 */
export function useSheetKeyboardInset(): {
  ref: React.RefObject<ViewInstance | null>;
  keyboardInset: number;
} {
  const ref = useRef<ViewInstance | null>(null);
  const inset = useKeyboardInset(ref);
  return { ref, keyboardInset: Platform.OS === "android" ? inset : 0 };
}

/**
 * Keyboard handling for a scrolling form.
 *
 * iOS already does this natively through `automaticallyAdjustKeyboardInsets`,
 * so the returned inset is Android-only. Spread `scrollProps` onto the
 * `ScrollView` and apply `keyboardInset` as `paddingBottom` on its *parent* —
 * padding the scroll view itself is what keeps the viewport above the IME.
 * Shrinking the viewport is not enough on its own: Android's
 * `ReactScrollView` scrolls a child into view when it takes focus, which
 * happens before the keyboard opens, so the field it just revealed can end up
 * behind the IME a moment later. Re-run the reveal once the shrink lands.
 */
export function useKeyboardAwareScroll(): {
  keyboardInset: number;
  contentRef: React.RefObject<ViewInstance | null>;
  scrollProps: {
    ref: React.RefObject<ScrollViewInstance | null>;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: () => void;
    scrollEventThrottle: number;
  };
} {
  const contentRef = useRef<ViewInstance | null>(null);
  const inset = useKeyboardInset(contentRef);
  const keyboardInset =
    Platform.OS === "android" && !hostResizesForKeyboard() ? inset : 0;
  const ref = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);
  const pendingReveal = useRef(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  useLayoutEffect(() => {
    if (keyboardInset > 0) pendingReveal.current = true;
  }, [keyboardInset]);

  const onLayout = useCallback(() => {
    if (!pendingReveal.current) return;
    pendingReveal.current = false;
    const scroll = ref.current?.getNativeScrollRef();
    const input = TextInput.State.currentlyFocusedInput();
    if (!scroll || !input) return;
    requestAnimationFrame(() => {
      scroll.measureInWindow((_x, viewportY, _width, viewportHeight) => {
        input.measureInWindow((_ix, inputY, _iWidth, inputHeight) => {
          const delta = revealScrollDelta(
            inputY + inputHeight,
            viewportY + viewportHeight,
          );
          if (delta > 0) {
            ref.current?.scrollTo({ y: offset.current + delta, animated: true });
          }
        });
      });
    });
  }, []);

  return {
    keyboardInset,
    contentRef,
    scrollProps: { ref, onScroll, onLayout, scrollEventThrottle: 16 },
  };
}
