# Enki (Expo mobile)

Internal support messenger mobile client. This repo is Expo-only; web and API live elsewhere.

## Language

**Enki**:
The product brand shown on launcher, auth, and hub wordmarks.
_Avoid_: Messenger (as product name), Casewire, ISM

**Contact**:
End-user role that only sees their own conversations. Reaches Home, Messages, and Help from the tab capsule; FAQ, Search, and Settings are reached from Home rather than from the tab capsule.
_Avoid_: Customer, client, user (when meaning this role)

**Agent**:
Support staff role. Sees assigned threads plus the unassigned pool. Cannot delete.
_Avoid_: Rep, operator

**Admin**:
Oversight role with slim mobile surface (users, unassigned, conversations, hub). Full analytics stay on web.
_Avoid_: Superuser, owner

**Hub**:
Role home screen (Contact / Agent / Admin variants). The first tab destination in every role.
_Avoid_: Dashboard, home feed

**Hub role label**:
Uppercase eyebrow on the hub greeting block: SUPPORT, AGENT, or ADMIN. Not the header wordmark.
_Avoid_: Customer Hub, Agent Dashboard, Executive Overview (as UI labels)

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
