# Enki — Expo

Expo iOS/Android client for an internal support messenger (Admin / Agent / Contact). The product is **Enki**; `internal support messenger` is the description, not the name.

**Source of truth:** Project Plan & Scope of Work PDF + `docs/scope.md` + current phase spec. This repo is Expo-only. Next.js web and NestJS/Postgres/better-auth live elsewhere.

## Now (Phase 2 — mock auth + role hubs)

Login/register UI + AsyncStorage session blob `{ email, role }`. No better-auth, no SecureStore, no JWT. `getDevUser()` follows stored role.

After login: Contact hub unchanged. Agent / Admin get hub variants (knowledge, mock charts, add offer). Mock catalog only.

Specs: `docs/superpowers/specs/2026-08-14-mock-auth-shell-design.md` + `docs/superpowers/specs/2026-08-14-role-hubs-design.md`

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
- Installed ahead of their phase (deliberate, 2026-08-17): `expo-camera`, `expo-notifications`, `expo-media-library`, `expo-sharing`, `expo-file-system`. Only the attachment path is wired — `expo-image-picker` and `expo-document-picker` via `lib/attachments.ts`. The rest are dependencies with no call sites yet; wire them in their own phase, do not treat their presence as permission to build the feature.
- Icons: import from `components/icons.ts`, never from `lucide-react-native` directly. The package root re-exports ~1750 icon modules and Metro does not tree-shake, so a barrel import bundles all of them. Same rule for `@expo-google-fonts/*` — import per-face subpaths (`@expo-google-fonts/manrope/400Regular`), never the package root, which `require()`s every weight in the family.
- Package manager: pnpm.
- Android: edge-to-edge is mandatory from Android 16 and is the SDK 57 default — there is **no** `edgeToEdgeEnabled` or `newArchEnabled` key in `app.json` (both were removed 2026-08-17; the schema rejects them and prebuild still emits `edgeToEdgeEnabled=true` / `newArchEnabled=true` in `gradle.properties`). `MainActivity` applies system-bar WindowInsets as padding on `android.R.id.content` **after** `super.onCreate` (never before) — this is applied by the `./plugins/with-system-bar-insets` config plugin, not by hand. `/android` is gitignored and regenerated, so never hand-edit `MainActivity.kt`; change the plugin instead. Native headers: `disableTopInsetApplication` so CustomToolbar does not add a second status inset. Insets from `useSafeAreaInsets` on **all** platforms (`screenTopPad` / `screenBottomPad`). A React Native `<Modal>` is its own window: it gets neither that native padding nor a usable inset from the root provider (which reads 0) — nest a `<SafeAreaProvider>` inside the `Modal` and call `useSafeAreaInsets` from a child of it, never from the component that renders the `Modal` (see `components/chat/attachment-sheet.tsx`). Rebuild the APK after native changes. No `StatusBar` `backgroundColor`. No `WindowCompat` before splash.
- Keyboard: never `KeyboardAvoidingView`. Edge-to-edge makes `softwareKeyboardLayoutMode: "resize"` a no-op, and KAV subtracts a window-space `keyboardFrame.screenY` from a parent-relative `onLayout` frame — under the MainActivity content padding those spaces differ, so it lands a status-bar height too low. Use `useKeyboardInset()` / `useKeyboardAwareScroll()` from `lib/keyboard-inset.ts`: `endCoordinates.height` is already the overlap with the padded React root. Scrolling forms keep iOS's native `automaticallyAdjustKeyboardInsets`; the hook's inset is Android-only there.
- App artwork carries no white plate: `assets/images/splash-icon.png` is the tight glyph on transparency, `icon.png` is full-bleed opaque (platform masks the corners), `android-icon-foreground.png` is the glyph at 85% of the canvas over `adaptiveIcon.backgroundColor` `#3631E7`. No `backgroundImage` / `monochromeImage` — those were Expo scaffold placeholders.
- Expo Go: `pnpm start` (`pnpm exec expo start -c`). Never `pnpm expo start`. Never reopen via Expo Go **Recents** — that replays a stale `exp://` URL and spins. Scan the **current** QR while Metro is running. `pnpm start:tunnel` uses Expo’s shared ngrok (v2 binary); if it errors `remote gone away` / `reading 'body'`, that is ngrok/Expo, not this app — use LAN (`pnpm start`). `@expo/ngrok` is a local devDependency; do not `npm i -g`.
- APK: build from the repo root, never from `.claude/worktrees/<branch>/`. CMake mangles each C++ source's full path into its object name, so the worktree prefix pushes react-native-screens and react-native-worklets past what CMake/ninja handle and the native build spins on `manifest 'build.ninja' still dirty after 100 tries`. Registry long paths and `subst` both fail to help (ninja is not long-path aware; Expo autolinking hands Gradle realpaths). `scripts/build-apk.mjs` refuses up front. Pass `--prebuild` after any `app.json` or plugin change — the script only prebuilds on its own when `android/` is missing.
- Phase bump: update `AGENTS.md`, `docs/scope.md`, `.cursor/rules/phase-discipline.mdc`, `.cursor/rules/expo-router.mdc` in the same change.

## Verification before completion

After any code change, run all three and report the real output:

```bash
pnpm exec tsc --noEmit   # typecheck
pnpm lint                # expo lint
pnpm start               # Metro / Expo Go
```

- **Typecheck needs Metro to have run once.** `uniwind-types.d.ts` is gitignored and generated by
  the Uniwind Metro plugin on start; `.expo/types` likewise. On a clean checkout `tsc --noEmit`
  reports a wall of `Property 'className' does not exist` errors that are artifacts of the missing
  generated types, not real breakage. Run `pnpm start` once, let it emit the types, then typecheck.
  Do not "fix" those errors by touching `components/ui/`.
- **`pnpm lint` is not wired up yet.** There is no `eslint.config.*` and no eslint binary in
  `node_modules`, so `expo lint` drops into an interactive "install ESLint?" prompt that hangs a
  non-interactive shell. Do not run it blind — ask the user to run it once to scaffold the config,
  then report lint as skipped until that lands.
- Dev server check: watch the Metro output for bundling failures, unresolved imports, and red-box
  errors, then open the screen you changed in Expo Go. Scan the **current** QR — never reopen from
  Expo Go Recents (stale `exp://` URL).
- Native changes (`app.json`, `./plugins/`, anything under the config-plugin path) are not verified
  by Metro. Rebuild the APK with `node scripts/build-apk.mjs --prebuild` from the repo root.
- State which checks were skipped and why. Report pre-existing failures as pre-existing.

Cursor rules: `.cursor/rules/`. If a rule and the current spec disagree, update the stale rule — don’t invent.
