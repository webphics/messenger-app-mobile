import { tabChrome } from "@/lib/tokens";

/**
 * Agent/Admin tab screen options.
 *
 * Tabs are peers, so the scene swaps rather than transitions: a slide would
 * claim a hierarchy that is not there, and a crossfade is a toll paid dozens of
 * times a session for nothing a person learns. What moves is the indicator in
 * the capsule, which is the only thing that actually changed.
 *
 * Not a hook any more, and deliberately so — with nothing to decide there is
 * nothing to read Reduce Motion for.
 */
export function useTabChrome() {
  return {
    ...tabChrome,
    animation: "none" as const,
  };
}
