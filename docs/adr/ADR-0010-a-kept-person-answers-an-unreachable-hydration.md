# A Kept person answers an Unreachable Hydration

The signed-in person is stored on this device beside the Session cookie, and a cold start that cannot
reach the API resolves to that person — signed in, and marked Stale — instead of to the Unreachable
screen. Unreachable survives for the case it always described and no longer shares with anything: a
device holding a credential and no idea whose it is.

This is what #40's last promise needed. The Store puts the Conversation list on disk and Restores it
before anything renders, so a phone in airplane mode should open on the rows it already holds. It did
not. Hydration got there first: `GET /auth/session` cannot be answered with no network, the outcome
was Unreachable, and with no viewer id there was nobody to Restore *for* — the rows sat in SQLite
behind a *Try again* button. The Store was never the problem. The session was.

So the session gets the same treatment the list got. `expo-secure-store` already holds the cookie;
it now holds the four fields that say who the cookie belongs to, written on every established session
and removed by `forgetCredential` along with the cookie, the CSRF pair and the Store. One key more in
the same keystore, with the same lifetime, is what makes this an addition to the credential rather
than a second source of truth about it.

What the Kept person is allowed to decide is deliberately one thing: the three Hydration outcomes
that say nothing about whether the cookie is still good — a dead network, a 500, an answer this
client could not read. All three keep the cookie already, for the reason #19 gave, and all three now
keep the person too. Everything else is unchanged, and that is the property worth stating plainly: a
Kept person is not a credential. No cookie is no session however well this device remembers who was
here, so a person who signed out stays signed out with no network. A cookie the API answered `401`
for is an expiry, and takes the Kept person, the Store and the downloaded documents with it —
an expiry is not a dead network, and the difference between the two is the whole of what this device
is trusted to tell apart.

A Stale session is a signed-in session, not a fourth status. Every screen asking "is somebody signed
in" must say yes, because drawing is the point; what the flag decides is the refetch that confirms
it. That goes out as an *authenticated* request, which is the other half of not signing anyone out by
accident: a cookie that expired while the phone was in a tunnel ends the session through the ordinary
expiry path — announced, explained, Store wiped — rather than through a second Hydration quietly
resolving `signed-out`.

It runs at three moments and never on a timer, because a Stale session works and there is nothing to
poll for. Two the auth provider can see for itself: entering the state, since the launch that
produced it may have raced a network that came back a second later, and every return to the
foreground. The third is the one that matters on a phone left open on a train — the network itself
returning — and the app already has an event for it: the socket connects. So `RealtimeProvider`
calls the confirmation on `connect`, which is a no-op for the confirmed sessions that are nearly all
of them. That is a deliberate alternative to a connectivity library: the socket's own reconnect is
already proof that the server is answering, and proof that it accepted this session's cookie on the
handshake.

The Stale session is deliberately invisible. There is no banner, no badge and no greyed-out chrome:
the screens look exactly as they did, because everything on them is true — it is what this device
last knew, which is all any Restored screen ever shows. What is *not* true is anything the person
tries to write, and that already speaks for itself: a send fails and offers to go again, an Engage or
a Takeover says the server could not be reached, and both read as the network rather than as the app
being broken. A banner saying "unconfirmed" would explain a distinction the person cannot act on, on
a screen whose failures already explain themselves, and it would be up for the few seconds before
the confirmation lands on every ordinary launch. If a surface ever appears where being wrong about
identity is expensive — a role-gated destructive action, say — the flag is already in the state for
it to read.

The cost is a name, an email and a role at rest on the device. That is a real change in what a lost
phone gives up, and it is the smallest version of it: no messages, no conversations, no tokens —
those are the Store's and they were already there — and it is destroyed by every moment that
destroys the cookie. It is not encrypted, for the same reason the database is not: `expo-sqlite` has
none built in, and a threat model that reaches the keystore has already taken the Session cookie
sitting beside it.
