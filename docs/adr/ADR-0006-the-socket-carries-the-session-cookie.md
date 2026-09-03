# The socket carries the Session cookie, and no origin

Live delivery needs a Socket.IO connection to the API's `/realtime` namespace, and the API
authenticates that connection exactly as it authenticates a request: it reads the Session cookie off
the handshake headers (`ConversationsGateway.handleConnection` → `AuthService.getSession`), and a
socket it cannot authenticate is disconnected on the spot.

A browser gets this for free — `withCredentials: true` and the cookie jar does the rest, which is
all the web client does. This client has no cookie jar it trusts. ADR-0004 established that React
Native's own cookie store is not somewhere a credential can be relied on, so every REST request goes
out with `credentials: "omit"` and a `Cookie` header this app writes by hand. Whether the same trick
survives a websocket handshake — which has no `fetch` options to omit and no body to hide anything
in — was the one open technical risk in the realtime ticket. It does, with one surprise that has
nothing to do with cookies.

## Websocket only

`socket.io-client` opens on HTTP long-polling and upgrades. This client asks for
`transports: ["websocket"]` and nothing else, because a polling handshake goes through React
Native's networking stack — the one ADR-0004 takes out of the path for REST — and there is no
`credentials: "omit"` to reach for here. The websocket transport is the one that carries a header
verbatim.

## The cookie travels as a header, and it works

`engine.io-client` detects React Native and passes `extraHeaders` to the platform `WebSocket` as its
`headers` option, which becomes real handshake headers. Verified against the running API from the
Android emulator: a socket carrying the header authenticates and stays up, and the same socket
without it is disconnected by the server immediately.

## The empty origin

React Native's Android WebSocket module adds an `origin` header of its own whenever the caller
supplies none, derived from the URL — `http://10.0.2.2:8080` on the emulator, a LAN address on a
device. The gateway refuses any origin that is not in the API's `ORIGIN_URL`, which is the web
client's address and will never be a device's. It allows a handshake with *no* origin, which is what
a native client honestly has. Supplying the header is the only way to stop React Native inventing
one, and empty is the value the server reads as absent (`if (origin && !allowed) reject`).

Measured against the running API, all four cases:

| `origin` on the handshake | Outcome |
| --- | --- |
| absent | authenticated |
| `http://10.0.2.2:8080` (React Native's default) | disconnected |
| empty | authenticated |
| `http://localhost:3330` (the web client's) | authenticated |

The alternative fix is on the API, which this repo does not hold: an origin header is a browser's
statement about itself, and treating its absence as the only acceptable answer from a native client
is a check that gets more awkward the more native clients there are.

## Two connections

A global connection lives while someone is signed in and carries every event; a second is opened
only while a thread is on screen, to put the device in that conversation's room — which is what the
server checks before it accepts a typing signal. The same shape the web client has.

The conversation connection passes `forceNew`. It would be a separate connection without it:
`socket.io-client` caches its manager by URL, and `lookup()` treats a namespace already open on that
manager as a reason to build a new one rather than hand back the socket it holds. The flag says so
out loud, because the alternative is a reader having to know that rule before believing that closing
a thread cannot disconnect the connection the whole app is listening on.

## One message is broadcast more than once, and the repeats are not duplicates

`message.created` arrives more than once for a single message. They are not copies: the API
broadcasts a message when it is written, and again each time its receipt advances. Measured against
the running server, a staff reply reached a Customer's socket twice about a second apart, the first
carrying `receiptStatus: "sent"` and the second `"delivered"` — `applyLiveReceipts` in the API's
`conversations.service.ts` is what marks it delivered to everyone connected and read to everyone
with the thread open.

So every one of them is wanted. That is how a tick moves from sent to delivered to read on a bubble
with nobody refreshing anything, and `mergeMessages` folds them in by id, the later copy replacing
the earlier.

The one reader that cannot take them all is an unread count, because adding is not idempotent: a
receipt advancing would raise a badge with nothing behind it. So the memory of what has been counted
belongs to the list and not to the socket (`createCountedMessages`, held by `lib/customer-inbox.tsx`).
Putting it at the socket seam — which this client did at first — is the mistake that looks like the
tidy one: it makes the count right and silently swallows every receipt update on the way.

## Consequences

A connection is only as current as the cookie it was opened with, because the handshake is where
authentication happens. The socket is therefore keyed on the signed-in person: a Session end closes
it rather than re-authenticating it.

Polling is not a fallback. A network that permits HTTP but not websockets — some corporate proxies —
gets no realtime rather than degraded realtime. REST is untouched, so what is lost is liveness.

**iOS is unverified, and two things are known.** Its WebSocket module fills the handshake's headers
from `NSHTTPCookieStorage` before applying ours, and it *adds* rather than replaces — so a stale
cookie in that store would travel beside the one this app sets, which is precisely the hazard
ADR-0004 documents for REST. It sets `Origin` the same way, so the empty value here may append to
its default rather than replace it. Android's module is explicit about both and skips its default
when an `origin` header is supplied. Whoever brings this to iOS should start here.

Android adds a `Cookie` header from its own store before ours too. It has been harmless — what is
stored there is the session that was just signed in with — but a stale one would be sent beside ours.
