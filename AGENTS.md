# Internal Support Messenger — Expo

Expo iOS/Android client for an internal support messenger (Admin / Agent / Contact). Source of truth: Project Plan & Scope of Work PDF + `docs/scope.md`.

This repo is Expo-only. Next.js web and NestJS/Postgres/better-auth live elsewhere.

## Now (Phase 0)

UI scaffold on mock data (`lib/mock-data.ts`). `DEV_ROLE` is the only session. No real auth, network, or persistence.

## Hard rules

- No Instagram stories. No case-status rail. No Casewire branding.
- Kebab-case files. PascalCase components. Named exports except Expo Router pages.
- Uniwind + Tailwind v4 only. Never NativeWind (`cssInterop`, `remapProps`, `nativewind/babel`).
- RNR primitives live in `components/ui/` only. App UI later: `components/chat/`, `components/inbox/` (do not create empty dirs).
- RBAC matrix is `lib/rbac.ts`, not ad-hoc `if (role)` in screens.
- Never edit `.env`.
- Do not add TanStack Query, socket.io, sqlite, Drizzle, better-auth, secure-store, expo-image, keyboard-controller, i18n, or FlashList until that phase.
- Package manager: pnpm.

Cursor rules: `.cursor/rules/`. Spec: `docs/superpowers/specs/2026-08-13-phase-0-scaffold-design.md`.
