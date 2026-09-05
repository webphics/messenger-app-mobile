# The Store does not leave the phone in a backup

The SQLite file the Store is written to is excluded from Android's automatic backup and from iOS's,
and nothing else about either platform's backup is changed. The app-wide `allowBackup: false` that
stood in for this is gone.

ADR-0008 chose an unencrypted database on a reasoning worth restating, because this is the sentence
that qualifies it: `expo-sqlite` has no encryption built in, and a threat model that reaches the
file has already reached the Session cookie in the keychain beside it. That holds while the file
stays on the device. A backup is the case where it does not. Android copies an app's data directory
to the user's cloud account unless the app says otherwise, and after #44 that directory holds every
Message of every thread that has been opened — a support history, off the phone, readable out of a
restore onto a device the person never signed into. The reasoning did not stop being true; it stopped
covering everything.

## Why not turn backup off

`allowBackup: false`, which #46 set, answers the question by refusing it. It is one line, it is
correct, and it costs the whole of what backup is for: a new phone restores the app with nothing in
it, no settings, no state, nothing the person had. Android has per-file rules for exactly this
distinction, so the narrow answer is available and the wide one is not worth its price.

What per-file rules cannot do is add to somebody else's. An `<application>` reads one
`fullBackupContent` and one `dataExtractionRules`, and `expo-secure-store` already points both at
rules of its own that keep the Session cookie out. So ours replace its files and restate its
exclusion, and the plugin throws rather than replacing rules it does not recognise — the failure mode
worth designing against is not a wrong rule, it is a third plugin's rule silently disappearing.

The exclusion names the `SQLite` directory rather than `enki-store.db`, because SQLite writes `-wal`
and `-shm` beside the database and the write-ahead log holds the newest Messages. It covers the
phone-to-phone transfer as well as the cloud: the keychain cannot travel either, and a Store arriving
without the credential it belongs to is a support history on a device nobody has signed into.

## iOS is the same decision and a different mechanism

There are no per-file rules. The flag is `NSURLIsExcludedFromBackupKey`, a resource value set on a
URL, inherited by everything inside a directory — so the directory `expo-sqlite` will open the
database in is created at launch, before anything has opened one, and marked. Failure is swallowed
for the reason every other failure in this area is: a phone that will not take the flag is not
something the person holding it can act on, and not a reason to refuse to launch.

## Why it is a config plugin

`android/` and `ios/` are generated and gitignored. A `res/xml` file written by hand, a manifest
attribute edited by hand and a line added to `AppDelegate.swift` by hand are all lost on the next
`expo prebuild --clean`, and lost per machine besides — the same reason
`plugins/with-system-bar-insets.js` exists. Expressed as configuration, the exclusion is a property
of the project rather than of one checkout.

The plugin splits at the boundary this repo splits everything native at: `plugins/backup-exclusion.js`
builds the strings and decides whether a manifest is safe to write to, imports nothing, and is
table-tested; `plugins/with-store-excluded-from-backup.js` owns the filesystem, the manifest and the
AppDelegate. Without that split a config plugin is the one part of this codebase nothing can be
asserted about without a native build.

## What is still backed up

Everything else, which is the point. Shared preferences other than `SecureStore`, AsyncStorage, the
app's other files. Not the cache: Android never backs up `cache/`, and iOS never backs up
`Library/Caches`, which is where the downloaded documents and the picker's staged copies already live
— so the attachment side of a support history was never in a backup and needed no rule.

That is more than `expo-secure-store`'s rules backed up, and the widening is deliberate rather than
incidental. Its files open with `<include domain="sharedpref" path="."/>`, and a single `<include>`
turns an Android rules document into an allow-list — under them the app's files and databases were
not backed up at all. Ours name only excludes, so the document is a deny-list. Nothing else lives in
those directories today, but the default has flipped: a later slice writing something private to the
document directory is backed up unless it says otherwise, where before it would have been left out by
accident. Anything of that kind belongs in `EXCLUSIONS` beside the Store.

## Verifying it

Not by reading the manifest, which is what the rules *say*. On Android:
`bmgr transport com.android.localtransport/.LocalTransport`, `bmgr backupnow <package>`, then read
the archive the transport wrote and look for the file. A backup that captured the shared preferences
and left `SQLite/` out is the pass — one that captured nothing at all only proves `allowBackup` is
off again. It needs a native build, so a change to the rules is not live until the dev client or the
APK is rebuilt.
