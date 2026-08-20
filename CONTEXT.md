# Enki (Expo mobile)

Internal support messenger mobile client. This repo is Expo-only; web and API live elsewhere.

## Language

**Enki**:
The product brand shown on launcher, auth, and hub wordmarks.
_Avoid_: Messenger (as product name), Casewire, ISM

**Contact**:
End-user role that only sees their own conversations. Hub has no tab bar.
_Avoid_: Customer, client, user (when meaning this role)

**Agent**:
Support staff role. Sees assigned threads plus the unassigned pool. Cannot delete.
_Avoid_: Rep, operator

**Admin**:
Oversight role with slim mobile surface (users, unassigned, conversations, hub). Full analytics stay on web.
_Avoid_: Superuser, owner

**Hub**:
Role home screen (Contact / Agent / Admin variants). Not a tab destination for Contact.
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
