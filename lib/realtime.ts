import { io, type Socket } from 'socket.io-client'

import { getSessionCookie } from '@/lib/api-client'
import { API_BASE_URL } from '@/lib/api-config'
import { userAgentHeaders } from '@/lib/app-user-agent'
import { REALTIME_NAMESPACE } from '@/lib/realtime-events'
import { shouldRetryAfterServerHangUp } from '@/lib/realtime-reconnect'

/**
 * The one place this app opens a socket to the API.
 *
 * The Session cookie is written onto the handshake by hand, exactly as
 * `lib/api-client.ts` writes it onto every request, and for the same reason:
 * this client owns its credential rather than leaving it to a cookie jar it does
 * not control. See `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`
 * for why that works over the websocket transport on React Native, and why this
 * asks for that transport and no other.
 *
 * Nothing here interprets a payload — `lib/realtime-events` does that. It builds
 * a connection, arms the one reconnect after a server close, and hands it back.
 */

/**
 * The namespace joined to the configured API root. `lib/api-config` has already
 * stripped any trailing slash, and Socket.IO derives the `ws`/`wss` scheme.
 */
const REALTIME_URL = `${API_BASE_URL}${REALTIME_NAMESPACE}`

/**
 * Open one authenticated connection.
 *
 * `forceNew` says out loud that the second caller wants a second connection.
 * `socket.io-client` would give it one anyway — its manager cache is keyed by
 * URL, and `lookup()` treats a namespace already open on the cached manager as
 * a reason to build a new manager rather than hand back the socket it holds —
 * but that is a subtlety of the library, not something a reader of this file
 * should have to know before trusting that closing a thread cannot disconnect
 * the connection the whole app is listening on.
 */
export function connectRealtime(
  sessionCookie: string,
  options: { forceNew?: boolean } = {},
): Socket {
  const socket = io(REALTIME_URL, {
    // Websocket only. The polling transport this would otherwise start on sends
    // its handshake through React Native's own networking stack, which keeps a
    // cookie store of its own — the same store ADR-0004 takes out of the path
    // for REST by refusing credentials. There is no equivalent switch here, so
    // the transport that carries a header verbatim is the only one asked for.
    transports: ['websocket'],
    // React Native's WebSocket takes a headers option, which is how the Session
    // cookie reaches a handshake that has no body to put it in.
    //
    // The empty origin is not decoration. React Native's Android WebSocket adds
    // an `origin` header of its own whenever the caller supplies none — derived
    // from the URL, so `http://10.0.2.2:8080` — and the API's gateway refuses a
    // handshake whose origin it does not recognise, which no address a device
    // reaches it on ever will be. Supplying the header suppresses that default,
    // and empty is what a client with no web origin honestly has: the server
    // reads it as absent, which is the case it already allows. See
    // `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`.
    //
    // The User-Agent is the one every REST request carries, so the handshake
    // names the same device; see `lib/user-agent`.
    extraHeaders: { Cookie: sessionCookie, origin: '', ...userAgentHeaders() },
    forceNew: options.forceNew ?? false,
  })

  // The server closes a socket when its session ends or the person's role,
  // password or two-factor changes. Reconnect once with the cookie this app
  // holds now, which a password change has just replaced. No cookie means the
  // session has gone here too, so nothing is retried. See `lib/realtime-reconnect`.
  let lastRetryAt: number | null = null
  socket.on('disconnect', (reason) => {
    const now = Date.now()
    if (!shouldRetryAfterServerHangUp(reason, lastRetryAt, now)) return
    const cookie = getSessionCookie()
    if (!cookie) return
    lastRetryAt = now
    socket.io.opts.extraHeaders = { ...socket.io.opts.extraHeaders, Cookie: cookie }
    socket.connect()
  })

  return socket
}
