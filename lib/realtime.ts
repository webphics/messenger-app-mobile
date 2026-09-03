import { io, type Socket } from 'socket.io-client'

import { API_BASE_URL } from '@/lib/api-config'
import { REALTIME_NAMESPACE } from '@/lib/realtime-events'

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
 * Nothing here interprets a payload — `lib/realtime-events` does that — and
 * nothing here holds state. It builds a connection and hands it back.
 */

/**
 * The namespace joined to the configured API root. `lib/api-config` has already
 * stripped any trailing slash, and Socket.IO derives the `ws`/`wss` scheme.
 */
const REALTIME_URL = `${API_BASE_URL}${REALTIME_NAMESPACE}`

/**
 * Open one authenticated connection.
 *
 * `forceNew` is what makes a second call a second connection. Without it
 * `socket.io-client` multiplexes: the manager is cached by URL and the socket by
 * namespace, so asking twice for the same namespace answers with the *same*
 * socket both times — and the first screen to close a thread would then
 * disconnect the connection the whole app is listening on. The web client's two
 * `io()` calls collapse into one socket for exactly that reason.
 */
export function connectRealtime(
  sessionCookie: string,
  options: { forceNew?: boolean } = {},
): Socket {
  return io(REALTIME_URL, {
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
    extraHeaders: { Cookie: sessionCookie, origin: '' },
    forceNew: options.forceNew ?? false,
  })
}
