import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { registerPushDevice } from "@/lib/conversation-api";
import {
  PUSH_PLATFORM,
  ensurePushPermission,
  readPushToken,
} from "@/lib/push-device";
import { shouldAskOnMessage, type PermissionTrigger } from "@/lib/push-rules";
import { useRealtimeEvents } from "@/lib/realtime-context";

/**
 * Ask if this moment should, and register if there is anything to register.
 *
 * One routine for both triggers, because a grant is worth nothing on its own: a
 * permission granted while no row holds this device's token is a phone the API
 * cannot dispatch to, and the person who just said yes would never learn it.
 *
 * The guard is `lib/push-rules` rather than anything here — both platforms draw
 * the system dialog once and refuse a later request without drawing anything, so
 * an unguarded ask is a no-op shaped like a prompt.
 */
async function askAndRegister(
  trigger: PermissionTrigger,
  stillSignedIn: () => boolean,
): Promise<boolean> {
  if ((await ensurePushPermission(trigger)) !== "granted") return false;

  const token = await readPushToken();
  // A session that ended while the dialog was up has nothing to register
  // under, and the request would go out on a credential already discarded.
  if (!token || !stillSignedIn()) return false;

  await registerPushDevice(token, PUSH_PLATFORM);
  return true;
}

/**
 * Renders nothing; asks for the notification permission at the two moments that
 * ask, and tells the API which token to dispatch against.
 *
 * Mounted above the router's screens for the same reason `SessionEndRedirect`
 * is: none of the moments this answers to belongs to a screen. A sign-in has
 * one, but a cold start that hydrates straight into a session does not — and
 * that is the more common of the two, because it is every launch after the
 * first. A Message arriving belongs to whichever screen the person is on, which
 * is to say to none of them.
 *
 * ## Why it registers again every time
 *
 * A push token rotates. A row holding an old one dispatches into nothing, and
 * nothing is exactly what that failure looks like from the phone, so the only
 * defence is to send the current one whenever there is a session to send it
 * under. `POST /push/devices` is idempotent on the token, so the common case
 * costs one request and writes no second row.
 *
 * ## Why a Stale session is a second attempt
 *
 * A launch with no signal resolves to a Kept person and a Stale session
 * (ADR-0010), and both halves of this fail there: no token can be read without
 * reaching Expo, and no row could be written without reaching the API. Waiting
 * for the next launch would leave that phone registered against whatever token
 * it last had, which for a rotation is nothing. So the effect watches the Stale
 * flag as well as the viewer, and #50's confirmation — the first reachable
 * moment, whether that is the way in, a foreground, or the socket connecting —
 * is what runs it again. At most twice per session, and never on a timer.
 *
 * ## Why nothing here is retried past that
 *
 * Fire-and-forget in the sense the Store's writes are: this never fails a
 * screen and never says anything on one. A person who refuses the permission, a
 * phone with no signal, a registration the API turns down — each ends here, with
 * an app that works exactly as it does without any of this. The retry is the
 * next launch, which is also what makes a loop unnecessary: there is nothing to
 * poll for and nobody waiting on the answer.
 */
export function PushRegistration() {
  const { state } = useAuth();
  const viewerId = state.status === "signed-in" ? state.user.id : null;
  const stale = state.status === "signed-in" && state.stale;

  /**
   * What this process has already done about push.
   *
   * `registered` is set only by a registration that actually went out, so every
   * other ending — a permission that is not granted, a token that could not be
   * read, a session that went while the dialog was up — leaves the second
   * trigger something to do. `running` is one attempt at a time, so a Message
   * landing while the first trigger still has the dialog up does not raise a
   * second. `askedOnMessage` is the second trigger's own once: an ask it made
   * and lost is not worth remaking per message.
   *
   * None of the three is the guard that matters. That is the record of the ask
   * under `Paths.cache`, and it is the one that outlives the process.
   */
  const registered = useRef(false);
  const running = useRef(false);
  const askedOnMessage = useRef(false);

  /**
   * Who is signed in *now*, read when the work below comes back rather than when
   * it started. Both triggers ask the same question of it — is this still the
   * person it ran for — so there is one predicate rather than one each.
   */
  const viewerIdRef = useRef(viewerId);
  useEffect(() => {
    viewerIdRef.current = viewerId;
  }, [viewerId]);

  const run = useCallback(async (trigger: PermissionTrigger, viewer: string) => {
    if (running.current) return;

    running.current = true;
    try {
      registered.current ||= await askAndRegister(
        trigger,
        () => viewer === viewerIdRef.current,
      );
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (viewerId) void run("sign-in", viewerId);
  }, [viewerId, stale, run]);

  /**
   * The moment that earns the grant: a Message landing in front of somebody the
   * first trigger never reached — a person who dismissed that dialog, upgraded
   * from a build with no push, or signed in before any of this shipped.
   *
   * Three things have to be true of the moment, and only the first is about the
   * Message: it has to be somebody else's, it has to arrive while the app is in
   * front of the person, and this process must have nothing registered already.
   *
   * The foreground check is the one that keeps the trigger honest. The socket is
   * not torn down when the app goes behind something, so a reply can land while
   * this phone is in a pocket — and a dialog raised there is drawn over whatever
   * the person is actually doing, answered by nobody, and spent for good. It is
   * read here rather than in `push-rules` because it is a fact about the moment
   * and not about the Message.
   */
  useRealtimeEvents((event) => {
    if (!viewerId || event.kind !== "message") return;
    if (registered.current || askedOnMessage.current || running.current) return;
    if (!shouldAskOnMessage(event.message, viewerId)) return;
    if (AppState.currentState !== "active") return;

    askedOnMessage.current = true;
    void run("message", viewerId);
  });

  return null;
}
