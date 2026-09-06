/**
 * When this app may put the operating system's notification dialog in front of
 * somebody, decided as a pure function of what the platform already says, which
 * moment is asking, and whether this device has ever asked at all.
 *
 * Pure, and importing nothing native, so the decision most likely to be got
 * wrong is the one with no mocks in front of it. `lib/push-device` next door
 * owns `expo-notifications` and does what this says — the same split as
 * `store-rows`/`conversation-store` and `attachment-budget`/`attachment-cache`.
 *
 * ## Why a guard at all
 *
 * Android 13+ and iOS each draw the system dialog once. A request after that is
 * refused without drawing anything, so an unguarded trigger is not a second
 * chance — it is a no-op shaped like a prompt, and a person who never sees it
 * cannot tell it from the app not asking. Every rule here exists to keep the one
 * dialog for the one moment somebody can actually answer it.
 */

/** Where the platform stands, as `expo-notifications` reports it. */
export type PushPermission = 'undetermined' | 'granted' | 'denied'

/**
 * The moments that ask.
 *
 * `sign-in` is the common case and costs nothing to place: somebody has just
 * signed in and there is no screen to interrupt. `message` is the one that earns
 * it — a reply landing in front of somebody is the question answering itself —
 * and it exists for whoever the first never reached, never as a second ask.
 */
export type PermissionTrigger = 'sign-in' | 'message'

export type PermissionAsk = {
  status: PushPermission
  trigger: PermissionTrigger
  /**
   * Whether the dialog has ever been raised on this device — a fact about the
   * installation, because that is the scope the platform's own once is. It
   * survives a Session end for the same reason: the dialog does.
   */
  askedBefore: boolean
}

export function shouldAskForPermission({
  status,
  trigger,
  askedBefore,
}: PermissionAsk): boolean {
  // Granted has nothing left to ask for, and denied is the refusal that draws
  // nothing. Only the undetermined status is a question anybody can answer.
  if (status !== 'undetermined') return false

  // Exhaustive rather than a membership test, so a third trigger has to answer
  // this question rather than inheriting an answer. Both of today's answer
  // alike: undetermined-and-already-asked is a dialog somebody dismissed, and
  // raising it again is what the platform refuses to draw.
  switch (trigger) {
    case 'sign-in':
    case 'message':
      return !askedBefore
  }
}
