import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import { registerPushDevice } from "@/lib/conversation-api";
import {
  PUSH_PLATFORM,
  ensurePushPermission,
  readPushToken,
} from "@/lib/push-device";

/**
 * Renders nothing; asks for the notification permission once, and tells the API
 * which token to dispatch against.
 *
 * Mounted above the router's screens for the same reason `SessionEndRedirect`
 * is: neither of the moments this answers to belongs to a screen. A sign-in has
 * one, but a cold start that hydrates straight into a session does not — and
 * that is the more common of the two, because it is every launch after the
 * first.
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

  useEffect(() => {
    if (!viewerId) return;

    let live = true;
    void (async () => {
      // Guarded on the permission still being undetermined, and guarded inside
      // `lib/push-rules` rather than here: both platforms draw the system
      // dialog once and refuse a later request without drawing anything, so an
      // unguarded ask on every launch would be a no-op shaped like a prompt.
      if ((await ensurePushPermission("sign-in")) !== "granted") return;

      const token = await readPushToken();
      // A session that ended while the dialog was up has nothing to register
      // under, and the request would go out on a credential already discarded.
      if (!token || !live) return;

      await registerPushDevice(token, PUSH_PLATFORM);
    })();

    return () => {
      live = false;
    };
  }, [viewerId, stale]);

  return null;
}
