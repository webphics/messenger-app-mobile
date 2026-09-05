# The Store is the source of truth, except for assignment

Screens read the Store and never the network. A fetched page, a socket event and a message typed
into the composer all reach a screen the same way — applied to the Store, which is written through
to SQLite and read back at the next cold start. Nothing renders from a request's answer directly.

The Store is held in memory and persisted, rather than being SQLite itself. The reducers this needs
already exist and are already tested: `mergeConversation`, `withIncomingMessage`, `applyMessagePage`
and the rest of `lib/thread-state.ts` and `lib/conversation-list.ts` — one module when this was
written — are pure functions with table tests beside them.
Expressing that logic as SQL instead would discard all of it and replace it with queries this repo's
standards forbid us from integration-testing — there are no component or integration tests here, only
pure-function unit tests and manual verification on a device. So SQLite gets the job it is good at
and nothing else: normalised `conversations`, `messages` and `outbox` tables, written on each state
change, read once on boot, queried when a thread pages back further than memory holds. It is
mockable at its native boundary the way `lib/attachment-cache.test.ts` already mocks
`expo-file-system`.

The exception is assignment. Engage and Takeover re-read the conversation from the API before they
fire, and a lost race is reported as such rather than as a raw `403`. Every other read tolerates
being a few seconds behind, because a few seconds behind is what the refetch on launch and on
foreground leaves. The Unassigned pool does not: it is the one surface several people are competing
over the same rows on, and a Store restored from disk can present one that was taken while the phone
was in a pocket. Reads and sends are cheap to be wrong about and easy to correct; claiming a thread
somebody else is already answering is neither.

The database is unencrypted, and what that costs is qualified by ADR-0011: the reasoning holds only
while the file stays on the phone, so the file is excluded from both platforms' device backups.

The cost is two copies of the truth and a write on every state change, which is the standard price of
this arrangement — it is Redux with persistence, not an invention. What it buys is the thing that
started this: a cold start draws the last thing the device knew instead of a spinner, and a screen
that was fetching three times before it could paint now fetches to confirm rather than to appear.
