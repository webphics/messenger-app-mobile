# The developer console is not a mobile surface

> Update, 2026-09-25: root ADR 0014 (`docs/adr/0014-the-developer-becomes-a-super-admin-who-alone-uses-the-console.md`) turns the developer into a super admin, who signs in on mobile as an ordinary admin, so `DirectoryRole` and every developer branch are gone from this client. The Console is still not a mobile surface.

Email logs, email providers, email templates and their editor, developer logs and the developer
profile page are web-only and stay web-only. This client builds none of them, and a screen here
never renders for the developer role.

Root ADR 0007 gives the developer its own route group that 404s everyone else, and keeps the role
invisible to admins. What lives behind that group is email infrastructure administration, not a
product surface. A template editor on a phone is also a worse tool than the laptop the one person
holding that role is already sitting at, so the port would spend real effort to produce a downgrade.

## The account-level need is met elsewhere

Root ADR 0008 found the motivating case for account self-service in this exact role: the one account
whose credential is a long-lived seeded secret was the one account that could not rotate it, and the
one role that can redirect every authentication email in the system could not see its own sessions.

That need is genuine and it is met by ADR-0012, which is role-agnostic for the same reason root
ADR 0008 gave. Rotating a seeded password and ending a session you do not recognise are account
operations and they work on a phone. Configuring an email provider is a product surface and it does
not need to.

## The role union is already correct

`lib/types.ts` declares `UserRole` as `'admin' | 'agent' | 'customer'` and notes it stays at three
deliberately, with `DirectoryRole = UserRole | 'developer'` as a separate type for directory rows
that may name one. That is the stronger version of what root ADR 0008 described on web. Nothing here
widens it, and a component that cannot render a developer still will not typecheck against one.

## Consequences

- Six items and one route group leave the mobile parity target.
- A developer who needs the console from a phone opens the web app, which is responsive and reachable.
- No mobile screen branches on a developer role, so no future screen author has to remember the case.
- What a developer account sees if it signs in to this app is not decided here and is not known.
  Sign-in is not role-gated and `DirectoryRole` proves the word reaches this codebase, so it is worth
  finding out, but it is a separate question from whether the console gets built.
