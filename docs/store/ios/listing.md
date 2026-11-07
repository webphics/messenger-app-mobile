# App Store listing — ChatRoute

Everything typed into App Store Connect → App Information and the version's _App Store_ tab. Every
claim is true of the shipped client (`docs/scope.md`); nothing web-only or mock is promised. No
testimonials, press or metrics, because there are none (`PRODUCT.md`).

## Fields

| Field              | Limit | Text                                                                                                                                |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Name               | 30    | ChatRoute                                                                                                                           |
| Subtitle           | 30    | Support messenger for teams                                                                                                         |
| Promotional text   | 170   | Your organisation's support conversations on your phone. Reply, claim unassigned threads and stay reachable when the app is closed. |
| Keywords           | 100   | see ASO                                                                                                                             |
| Primary category   |       | Business                                                                                                                            |
| Secondary category |       | Productivity                                                                                                                        |
| Age rating         |       | 4+                                                                                                                                  |
| Support URL        |       | required                                                                                                                            |
| Marketing URL      |       | optional                                                                                                                            |
| Privacy policy URL |       | required                                                                                                                            |
| Copyright          |       | © 2026 Zeest Global                                                                                                                 |
| Bundle ID          |       | com.thechatroute.app                                                                                                                |
| SKU                |       | chatroute-ios                                                                                                                       |

## Description (4000)

App Store renders no markdown either. Paste as plain text.

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

ChatRoute is for organisations that run it. Sign in with the email your organisation knows, a magic link, your Google account or Sign in with Apple.
```

_Built to be reachable_ matches the Android description. The APNs key is on EAS (`publishing.md`),
but push has not been seen arriving on a real iPhone yet. Confirm it in TestFlight before
submitting; if it does not arrive, take the paragraph out rather than ship a claim that is false.

## ASO notes (App Store)

Apple indexes name, subtitle and the keyword field; the description is not indexed. Do not repeat
words across the three, each slot is wasted when it duplicates another.

Keywords (100 chars, no spaces after commas, no words already in the name or subtitle):

```
helpdesk,internal,agent,tickets,customer,chat,inbox,voice,notes,staff,organisation,organization
```

Both spellings of organisation are deliberate: the keyword field is the one place Apple matches
US and UK searches separately.

Target phrases, in priority order:

1. internal support messenger
2. customer support app for teams
3. helpdesk chat
4. team support inbox
5. support ticket chat

Localisation: primary en-GB to match in-app copy. An en-US localisation can reuse the description
with _organization_ swapped in.

## Screenshot captions

Drawn on the images (see `images.md`), Manrope ExtraBold headline, Manrope Regular sub-line. The
first release uploads 1 to 6 from `screenshots/iphone-6.3/`, scaled from the 1320 × 2868 masters
to 1206 × 2622, because App Store Connect's iPhone tab (iPhone with Dynamic Island, medium
display) accepts only the 6.1"/6.3" sizes: 1179 × 2556 or 1206 × 2622. Number 7 is left
out: its capture comes from Android, so it shows Google without the Continue with Apple button the
iOS sign-in screen has, and older footer text. Bring it back from an iPhone capture of the TestFlight
build, with the sub-line changed to _Password, magic link, Google, Apple_.

| #   | Caption                            | Sub-line                                                   |
| --- | ---------------------------------- | ---------------------------------------------------------- |
| 1   | Help, in one thread                | Ask your organisation and get the reply where you asked    |
| 2   | Photos, documents, voice notes     | Attach what explains it faster than typing                 |
| 3   | Claim it. Reply. Done.             | Agents work the Unassigned pool with one tap               |
| 4   | Oversight that fits in a pocket    | Directory, organisations, audit log and charts for Admins  |
| 5   | Opens on what your phone last knew | Conversations stay on the device, with or without a signal |
| 6   | Announcements and groups           | The Wall and Communities, for every role                   |
| 7   | Sign in your way                   | Password, magic link, Google, two-factor                   |

## What's New (first release, 4000)

```
First release of ChatRoute for iPhone.
- Support conversations for Customers, Agents and Admins
- Photos, documents and voice notes
- Works offline on what the phone last knew
- Communities and the Wall
```

## App Privacy (nutrition labels)

| Data type                                                    | Collected | Linked to identity | Used for tracking | Purpose                               |
| ------------------------------------------------------------ | --------- | ------------------ | ----------------- | ------------------------------------- |
| Contact info: name, email, phone                             | yes       | yes                | no                | App functionality, account management |
| User content: messages, photos or videos, audio, other files | yes       | yes                | no                | App functionality                     |
| Identifiers: device ID (push token)                          | yes       | yes                | no                | App functionality                     |
| Diagnostics                                                  | no        | —                  | —                 | —                                     |
| Location, contacts, financial, health, browsing, purchases   | no        | —                  | —                 | —                                     |

No third-party SDK collects anything: Google sign-in returns an ID token to the API and nothing
else; there is no analytics or crash SDK in `package.json`.

## Review information

| Field            | Text                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in required | Yes. Demo account: give one Customer, one Agent and one Admin with password sign-in, plus a spare Customer to test account deletion with. Sign-up exists in the app, but a new account belongs to no organisation, so it sees almost nothing |
| Contact          | name, phone, email of whoever answers the reviewer                                                                                                       |
| Notes            | see `publishing.md` → Review notes                                                                                                                       |
| Attachment       | optional: a 30 s screen recording of sign-in → thread → reply, which shortens review for sign-in-gated apps                                              |
