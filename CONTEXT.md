# Enki (Expo mobile)

Internal support messenger mobile client. This repo is Expo-only; web and API live elsewhere.

## Language

**Enki**:
The product brand shown on launcher, auth, and hub wordmarks.
_Avoid_: Messenger (as product name), Casewire, ISM

**Customer**:
End-user role that only sees their own conversations. Reaches Home, Messages, and Help from the tab capsule; FAQ, Search, and Settings are reached from Home rather than from the tab capsule. The name matches the API's `role` enum and the web client's glossary; the on-screen eyebrow still reads SUPPORT.
_Avoid_: Contact, client, user (when meaning this role)

**Contact list**:
The address book a staff member picks from when starting a conversation, backed by
`GET /conversations/contacts`. A *contact* here is an addressable person of any role — unrelated to
the end-user role, which is Customer. The two must not be collapsed.
_Avoid_: Contacts (bare, when the Customer role is meant), directory, people picker

**Agent**:
Support staff role. Sees assigned threads plus the unassigned pool. Cannot delete.
_Avoid_: Rep, operator

**Admin**:
Oversight role with slim mobile surface (users, unassigned, conversations, hub). Full analytics stay on web.
_Avoid_: Superuser, owner

**Hub**:
Role home screen (Customer / Agent / Admin variants). The first tab destination in every role.
_Avoid_: Dashboard, home feed

**Hub role label**:
Uppercase eyebrow on the hub greeting block: SUPPORT, AGENT, or ADMIN. Not the header wordmark.
_Avoid_: Customer Hub, Agent Dashboard, Executive Overview (as UI labels)

### Session

**Session cookie**:
The Better Auth session cookie the API sets, held in the device keychain and replayed on every request as a `Cookie` header this client sets by hand. Opaque to the app — never parsed, only stored, sent, and discarded.
_Avoid_: Session token, JWT, access token, bearer token

**CSRF token**:
The double-submit value fetched from the API and sent as `X-CSRF-Token` on every mutation, alongside the `csrf-token` cookie it is paired with. Not bound to a session — one is fetched, cached, and reused until the API rejects it.
_Avoid_: XSRF token, nonce, anti-forgery token

**Hydration**:
Reading the stored Session cookie at cold start and exchanging it for the signed-in Customer, Agent, or Admin. Ends in one of three states: signed in, signed out, or unreachable.
_Avoid_: Bootstrapping, session restore, rehydrate

**Unreachable**:
The Hydration outcome where a Session cookie exists but the API could not be reached. Distinct from signed out: the cookie is kept and the person is not sent to sign-in.
_Avoid_: Offline, error, disconnected

**Unassigned pool**:
Conversations with no assignee, visible to Agent and Admin.
_Avoid_: Queue (unless referring to ordering), inbox (inbox is the conversation list)

**Offers**:
In-app promo carousel plus the shared group chat `id: 'offers'`. `"Sponsored"` is a section label only.
_Avoid_: Stories, ads, sponsored content (as a product feature)

**Launch animation**:
The looping transparent character animation on the cold-start screen, shown while the session hydrates. Rendered from an animated WebP; the surface behind it is the app background, not part of the asset.
_Avoid_: Splash screen (that is the separate native `expo-splash-screen` surface this screen dismisses), loading video, chroma-keyed video

**Tab capsule**:
The floating rounded nav bar at the bottom of every role. Icon-only — destination names live in the accessible name, not on screen.
_Avoid_: Tab bar (that is the host navigator's own bar, kept invisible beneath), dock, bottom nav

**Message**:
A unit of chat content in a Conversation: a text body and/or one Attachment. The body may be empty when the Message is only an Attachment; when both are present the body is a caption.
_Avoid_: Post, chat item, media message (as a separate entity from Message)

**Attachment**:
A single file or recording on a Message — image, video, document, or voice note — identified by a local device URI in this client until a server exists. At most one Attachment per Message.
_Avoid_: Upload, media blob, file message (as a type parallel to Message)

**Voice note**:
An audio Attachment recorded in the app for a Message, not a file picked from the library.
_Avoid_: Voice message, audio clip, mic message
