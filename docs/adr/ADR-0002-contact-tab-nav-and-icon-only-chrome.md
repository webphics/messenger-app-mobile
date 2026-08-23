# ADR-0002: Contact tab nav and icon-only chrome

- Status: Accepted
- Date: 2026-08-24

## Context

The domain record carried a premise that Contact has no tab bar: the
`CONTEXT.md` glossary's Contact entry, `PRODUCT.md`'s Contact role
description and its Positioning bullet, and the `.cursor/rules/*.mdc` rule
files all stated it, one of them (`expo-router.mdc`) with the further
directive "Do not nest `home/` under contact." In practice Contact's two
most-used destinations — Messages and Help — were reachable only by
returning to the hub and tapping an action tile, one level deeper than the
equivalent journey for Agent or Admin.

Separately, the shared tab capsule carried a text label under every icon.
Admin's four labels ("Home", "Users", "Unassigned", "Conversations") set the
capsule's width and height budget, and the longest of them drove a layout the
other roles did not need.

## Decision

1. Contact gains the same floating tab capsule as Agent and Admin. Its route
   tree mirrors `(agent)`: a `Tabs` layout wrapping a nested `(home)` stack.
2. Contact's destinations are Home, Messages, Help — the hub itself plus the
   two action tiles the hub already leads with. FAQ, Search and Settings stay
   pushed inside the home stack; they are one tap from the hub and do not earn
   peer status with Messages.
3. The tab capsule is icon-only for all three roles. `options.title` is no
   longer rendered but still feeds `accessibilityLabel`, so every destination
   keeps its accessible name and unread count.
4. Because `(home)` is an expo-router route group, no public route URL changed.

## Consequences

- `CONTEXT.md`'s Contact and Hub entries and `PRODUCT.md`'s Users and
  Positioning sections were rewritten to match; the "no tab bar" premise no
  longer appears in either document. The `.cursor/rules/*.mdc` files listed
  above still carry it as of this ADR and are tracked as follow-up cleanup,
  not part of this decision.
- Contact reaches Messages and Help in one tap from any screen instead of two.
- Wayfinding for Admin's four tabs now rests entirely on icon recognition. The
  four glyphs (House, Users, Inbox, MessageCircle) were reviewed as silhouettes
  and kept; if Admin gains a fifth destination, revisit this before adding it.
- Sighted users lose the text labels; screen-reader users lose nothing.
- The Agent and Admin `conversations` tab dropped its `tabBarLabel:
  "Conversations"` — with the capsule icon-only, that prop had become inert,
  since the accessible name now comes from `options.title` alone. That tab's
  accessible name is now "Messages"; no route, icon, or destination changed.
