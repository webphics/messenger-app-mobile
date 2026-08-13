# Internal Support Messenger — Expo

Expo iOS/Android client for an internal support messenger (Admin / Agent / Contact).

**Source of truth:** Project Plan & Scope of Work PDF + `docs/scope.md` + current phase spec. This repo is Expo-only. Next.js web and NestJS/Postgres/better-auth live elsewhere.

## Now (Phase 1)

Basic UI mock on `lib/mock-data.ts`. `DEV_ROLE` is the only session. No real auth, network, or persistence.

Spec: `docs/superpowers/specs/2026-08-13-phase-1-ui-design.md`

## Hard rules

- No Instagram stories. No case-status rail. No Casewire branding.
- Offers = promo carousel + shared group `id: 'offers'`. `"Sponsored"` is a label.
- Kebab-case files. PascalCase components. Named exports except Expo Router pages.
- Uniwind + Tailwind v4 only. Never NativeWind (`cssInterop`, `remapProps`, `nativewind/babel`).
- RNR primitives live in `components/ui/` only. App UI: `components/hub/`, `components/inbox/`, `components/chat/` (create with real files, not empty dirs).
- Modular: thin routes compose feature components; logic in `lib/`. Extract at real boundaries.
- RBAC matrix is `lib/rbac.ts`, not ad-hoc `if (role)` in screens. Capability ≠ UI this phase.
- Never edit `.env`. Do not log message bodies or PII. See `.cursor/rules/security.mdc`.
- Do not add TanStack Query, socket.io, sqlite, Drizzle, better-auth, secure-store, expo-image, keyboard-controller, i18n, or FlashList until that phase.
- Package manager: pnpm.
- Android: `edgeToEdgeEnabled: true` in `app.json`. `MainActivity` applies system-bar WindowInsets as padding on `android.R.id.content` **after** `super.onCreate` (never before). Insets from `useSafeAreaInsets` on **all** platforms (`screenTopPad` / `screenBottomPad`). Rebuild the APK after native changes. No `StatusBar` `backgroundColor`. No `disableTopInsetApplication`. No `WindowCompat` before splash.
- Expo Go: `pnpm start` (`pnpm exec expo start -c`). Never `pnpm expo start`. Never reopen via Expo Go **Recents** — that replays a stale `exp://` URL and spins. Scan the **current** QR while Metro is running. `pnpm start:tunnel` uses Expo’s shared ngrok (v2 binary); if it errors `remote gone away` / `reading 'body'`, that is ngrok/Expo, not this app — use LAN (`pnpm start`). `@expo/ngrok` is a local devDependency; do not `npm i -g`.
- Phase bump: update `AGENTS.md`, `docs/scope.md`, `.cursor/rules/phase-discipline.mdc`, `.cursor/rules/expo-router.mdc` in the same change.

Cursor rules: `.cursor/rules/`. If a rule and the current spec disagree, update the stale rule — don’t invent.
