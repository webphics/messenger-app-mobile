# Google Play listing — ChatRoute

Everything typed into the Play Console's *Main store listing* page. Every claim is true of the
shipped client (`docs/scope.md`); nothing web-only or mock is promised. No testimonials, press or
metrics, because there are none (`PRODUCT.md`).

## Fields

| Field | Limit | Text |
|---|---|---|
| App name | 30 | ChatRoute |
| Short description | 80 | Internal support messenger. Threads, attachments, voice notes, push. |
| Category | | Business |
| Tags | up to 5 | Business communication, Customer support, Team collaboration, Messaging, Productivity |
| Email | | support contact (required, shown publicly) |
| Website | | marketing or docs URL |
| Privacy policy | | required URL |

## Full description (4000)

Play renders no markdown. Paste the plain version; the bold lines become plain capitalised lead-ins.

```
ChatRoute is the internal support messenger for your organisation. Customers ask for help, Agents answer, Admins keep an eye on the whole thing. Every role gets its own home, and only sees what it is allowed to see.

FOR PEOPLE ASKING FOR HELP
Open a support conversation with your organisation and get a reply in the same thread. Attach a photo, a document or a voice note. Search the FAQ and knowledge base before you ask.

FOR AGENTS
Work the Unassigned pool and claim a thread with one tap. Reply with text, photos, documents and voice notes. Message colleagues directly. Label threads and leave internal notes that customers never see.

FOR ADMINS
Oversight that fits in a pocket: the account directory, organisations and invitations, labels, saved responses, the audit log and analytics charts. Take over a thread when it needs you.

BUILT TO BE REACHABLE
Push notifications bring a reply to your lock screen when the app is closed, and tapping one opens the thread. In the app, a quiet banner tells you about a message landing in another conversation.

WORKS WITHOUT A SIGNAL
ChatRoute keeps your conversations and recent messages on the device. A cold start opens on what your phone last knew, and a message that could not be sent waits for you rather than disappearing.

ALSO IN THE APP
Communities and group conversations. The Wall for announcements. Reactions and replies. Active sessions, password and two-factor sign-in managed from Settings. Signing out removes everything ChatRoute kept on the device.

ChatRoute is for organisations that run it. Sign in with the email your organisation knows, a magic link or your Google account.
```

## ASO notes (Play)

Play has no keyword field. Ranking reads the title, short description and the first lines of the
full description, so the terms that matter sit there on purpose: *support messenger*, *internal*,
*threads*, *voice notes*, *push*, *Agents*, *Admins*, *organisation*. Do not keyword-stuff the
description; Play's policy flags repeated terms.

Target phrases, in priority order:

1. internal support messenger
2. customer support app for teams
3. helpdesk chat
4. team support inbox
5. support ticket chat

Spelling: British (*organisation*) matches the in-app copy. Add a US-English localisation later
with *organization* if the audience warrants it; Play lets both exist.

## Screenshot captions

Drawn on the images (see `images.md`), Manrope ExtraBold headline, Manrope Regular sub-line.

| # | Caption | Sub-line |
|---|---|---|
| 1 | Help, in one thread | Ask your organisation and get the reply where you asked |
| 2 | Photos, documents, voice notes | Attach what explains it faster than typing |
| 3 | Claim it. Reply. Done. | Agents work the Unassigned pool with one tap |
| 4 | Oversight that fits in a pocket | Directory, organisations, audit log and charts for Admins |
| 5 | Reaches you when the app is closed | A reply lands on the lock screen and opens the thread |
| 6 | Opens on what your phone last knew | Conversations stay on the device, with or without a signal |
| 7 | Announcements and groups | The Wall and Communities, for every role |
| 8 | Sign in your way | Password, magic link, Google, two-factor |

## Release notes (first release, 500)

```
First release of ChatRoute for Android.
- Support conversations for Customers, Agents and Admins
- Photos, documents and voice notes
- Push notifications
- Works offline on what the phone last knew
- Communities and the Wall
```

## App content declarations

| Section | Answer |
|---|---|
| Privacy policy | URL required |
| App access | Restricted: provide one Customer, one Agent and one Admin demo account with password sign-in, plus a spare Customer account the reviewer may delete. The app does have a sign-up step (`POST /auth/sign-up`, magic link, first Google sign-in), but a new account belongs to no organisation, so it sees almost nothing; the demo accounts are what reach every screen |
| Ads | No ads. "Offers" is an in-app promo carousel from the organisation, not an ad SDK (`PRODUCT.md`) |
| Content rating | IARC questionnaire: communication app, user-generated content exchanged between signed-in members of one organisation, moderated by that organisation. Expect *Everyone* |
| Target audience | 18 and over (work tool) |
| News app | No |
| COVID-19 | No |
| Data safety | See below |
| Government app | No |
| Financial features | None |
| Health | None |

### Data safety form

| Data | Collected | Shared | Purpose | Optional | Deletable |
|---|---|---|---|---|---|
| Name, email, phone | yes | no | account management, app functionality | phone optional | on account deletion |
| Messages, photos, audio, files | yes | no | app functionality | — | no: kept in the other participants' conversations, without the sender's name, after account deletion |
| Device push token | yes | no | app functionality (push) | — | removed on sign-out |
| Crash logs, diagnostics | no | no | — | — | — |
| Location, contacts, calendar, financial | no | no | — | — | — |

Encrypted in transit: yes. Data is not used for advertising or tracking.

Deletion. Signing out destroys the on-device Store and the push registration (`session-wipe`).
Anyone can delete their own account:

- **In the app:** Settings → Account → _Delete account_, which explains what goes and asks to
  confirm (`app/account/delete.tsx`, `POST /auth/delete-account`).
- **Without the app:** `https://<web origin>/delete-account`, the public page Play's _Delete account
  URL_ field wants. It describes both routes and links to the web Profile page, which has the same
  _Delete account_ card. Put this URL in the Data safety form's account deletion question and in
  the store listing.

What is deleted and what is kept is in `api/docs/planning/account-deletion.md`. In short: the
account, its contact details, password and Google link, memberships, notifications and devices go
at once; messages and wall posts the person sent stay in their conversations, shown as from a
deleted account. Declare that in Data safety as "Messages, photos, audio, files: some data is
retained" with the reason "other users' conversation history". The two refusals, the workspace
owner and the last admin, are staff accounts and do not affect Customers.
