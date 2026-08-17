import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";

/** Gap left between a focused field and the top of the keyboard. */
export const FOCUS_REVEAL_MARGIN = 16;

/**
 * How far the keyboard overlaps the app's laid-out content, in dp.
 *
 * `endCoordinates.height` is the correct number on both platforms, and the
 * only one that survives Android edge-to-edge:
 *
 * - Android reports `imeInsets.bottom - systemBarInsets.bottom`, and
 *   MainActivity already pads `android.R.id.content` by the system bars — so
 *   what is left is exactly the overlap with the React root.
 * - iOS reports the keyboard height measured from the bottom of the screen,
 *   and the React root fills the screen — again the exact overlap.
 */
export function keyboardOverlap(event: KeyboardEvent | null | undefined): number {
  return Math.max(0, event?.endCoordinates?.height ?? 0);
}

/** How far to scroll so `inputBottom` clears `viewportBottom`. */
export function revealScrollDelta(
  inputBottom: number,
  viewportBottom: number,
  margin: number = FOCUS_REVEAL_MARGIN,
): number {
  return Math.max(0, inputBottom + margin - viewportBottom);
}

/**
 * Keyboard overlap as a live value.
 *
 * `KeyboardAvoidingView` cannot do this job here: it subtracts
 * `keyboardFrame.screenY` (window coordinates) from its own `onLayout` frame,
 * which is *parent*-relative. Under edge-to-edge the React root starts below
 * the status bar, so the two coordinate spaces disagree and the view settles a
 * status-bar height too low — the chat composer and the password field ended
 * up clipped by the keyboard for exactly that reason. And with `behavior`
 * unset (what the forms used on Android) it does nothing at all.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(() => keyboardOverlap(null));

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => setInset(keyboardOverlap(event));
    const onHide = () => setInset(0);
    // iOS fires `will*` ahead of the animation; Android only has `did*`.
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
  }, []);

  return inset;
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
  scrollProps: {
    ref: React.RefObject<ScrollView | null>;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: () => void;
    scrollEventThrottle: number;
  };
} {
  const inset = useKeyboardInset();
  const keyboardInset = Platform.OS === "android" ? inset : 0;
  const ref = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const pendingReveal = useRef(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  // Layout, not passive: the flag has to be set before the shrink's onLayout
  // can come back from native, or the reveal is skipped.
  useLayoutEffect(() => {
    if (keyboardInset > 0) pendingReveal.current = true;
  }, [keyboardInset]);

  // The shrink arrives as a layout change on the scroll view, so this is the
  // first moment both it and the focused field measure at their final frames.
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
    scrollProps: { ref, onScroll, onLayout, scrollEventThrottle: 16 },
  };
}
