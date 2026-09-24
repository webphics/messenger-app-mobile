/**
 * The clock behind the Launch gate's bound: one per launch, armed when the
 * first Conversation load for a signed-in viewer starts.
 *
 * `lib/api-client`'s Request deadline bounds a round trip, and #43 leaned on it
 * to guarantee the gate always settles. It does not. A Resync fires on socket
 * *re*connect, bumps the inbox's generation and starts a replacement load with
 * a deadline of its own, so a socket that flaps inside the launch window bounds
 * each hop and never the launch. This is the thing the deadline could not be:
 * a clock that nothing happening underneath it restarts.
 *
 * Which is the whole of the design. `arm` is idempotent while it is running, so
 * the inbox can call it at the top of every load and the first one wins.
 * `settle` ends the launch — the gate has been released and a later load must
 * not put it back — and `reset` begins another, for a different viewer or a
 * provider going away.
 *
 * Kept out of `lib/conversation-inbox` and out of React because a `setTimeout`
 * written inline in a provider is untestable here: this repo has no component
 * or provider tests, and a bound nobody can test firing is not much of a bound.
 * The precedent is `lib/simulated-refresh`, whose timer-bearing functions are
 * exported plainly and driven under `jest.useFakeTimers()`.
 */

/**
 * How long the launch screen may hold, from the first load starting.
 *
 * A number about the person rather than about the network, and deliberately
 * shorter than a single Request deadline. Sizing it to contain whatever is
 * happening underneath — one abandoned load plus its replacement running out
 * its own deadline — only ever moves the number up, and that coupling is what
 * #52 is a report about. Nothing makes ten seconds of a loading screen with no
 * control on it worth watching.
 *
 * Being cut off is cheap, which is what makes this affordable: with the Store
 * there is a Hub with Restored rows behind the launch screen the whole time, and
 * a launch with nothing Restored gets the list's own failure state — a screen a
 * person can act on, which a loading screen is not.
 */
export const LAUNCH_DEADLINE_MS = 10_000;

export type LaunchDeadline = {
  /**
   * Start the clock, unless this launch already has one running or has already
   * finished. Safe to call on every load; a Resync's is the call that does
   * nothing.
   */
  arm(onExpire: () => void): void;
  /** The fetch settled, by any means. This launch is over. */
  settle(): void;
  /** A different viewer, or the provider going away. The next load may arm. */
  reset(): void;
};

type Phase = "idle" | "armed" | "done";

export function createLaunchDeadline(
  delayMs = LAUNCH_DEADLINE_MS,
): LaunchDeadline {
  let phase: Phase = "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    arm(onExpire) {
      if (phase !== "idle") return;
      phase = "armed";
      timer = setTimeout(() => {
        timer = undefined;
        phase = "done";
        onExpire();
      }, delayMs);
    },
    settle() {
      stop();
      phase = "done";
    },
    reset() {
      stop();
      phase = "idle";
    },
  };
}
