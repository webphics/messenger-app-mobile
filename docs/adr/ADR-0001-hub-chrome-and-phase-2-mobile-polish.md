# ADR-0001: Hub chrome and Phase 2 mobile polish

- Status: Accepted
- Date: 2026-08-20
- Phase: 2 (mock auth + role hubs)

## Context

The app now ships role-based hubs for Contact, Agent, and Admin. Hub chrome and copy drifted from the product brand and from the role model:

- Hub header wordmark still said Messenger in some surfaces.
- Role labels and greeting copy were inconsistent per role.
- Motion behavior should remain compatible with reduced-motion users.
- Phase 2 needs stable list behavior without introducing Phase 3/5 dependencies.

## Decision

1. Brand all hubs with ChatRoute logo + ChatRoute wordmark in the header.
2. Keep role labels in the greeting block (not the header) as:
   - SUPPORT for Contact
   - AGENT for Agent
   - ADMIN for Admin
3. Use role-tuned greeting copy:
   - Contact: `How can we help, {name}? 👋`
   - Agent: `Ready when you are, {name} 👋`
   - Admin: `Welcome back, {name} 👋`
4. Treat reduced motion as a product requirement: animated transitions must keep a reduced-motion-safe behavior path and avoid decorative-only motion.
5. Keep Phase 2 list stabilization on React Native `FlatList` patterns (stable keys, bounded re-renders, predictable item layout where possible) and explicitly do not add `FlashList` or `expo-image` in this phase.

## Consequences

- Hub chrome and copy are centralized in pure helpers, reducing role-copy drift.
- Product surfaces consistently reflect ChatRoute branding in header and settings chrome.
- Motion and list guidance are documented for future Phase 2 work while staying inside current dependency constraints.
