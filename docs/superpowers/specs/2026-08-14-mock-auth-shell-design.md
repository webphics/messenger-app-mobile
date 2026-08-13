# Phase 2 — Mock auth shell + splash/icon

**Date:** 2026-08-14  
**Product:** Internal Support Messenger (Expo)  
**Depends on:** Phase 1 UI mock (`docs/superpowers/specs/2026-08-13-phase-1-ui-design.md`)  
**Approach:** Mock login/register + local role memory. Not better-auth.

Visual inspiration: `assets/images/logo.png` (two-bubble M, blue + cyan). Generate a new mark — do not screenshot or ship that PNG as the icon.

---

## 1. What this phase builds

Mock-only gate in front of the existing role groups.

1. **Login** and **Register** — same chrome, everyone. No backend.
2. **Local session blob** — email + role in AsyncStorage. No JWT. No SecureStore. No `fetch`.
3. **Settings role switcher** — Contact / Agent / Admin. Any logged-in user. Persist role. Jump to that group.
4. **Splash + app icon** — generated two-bubble mark on white. No wordmark.

Contact / Agent / Admin homes: Contact stays Phase 1. Agent/Admin hub variants = `docs/superpowers/specs/2026-08-14-role-hubs-design.md`.

**Done when:**

- Cold start with no session → login.
- Valid login or register → logged in. First-ever role is `contact`. If a role was stored from a previous session (including after sign-out), keep that role.
- Invalid email/password (and register confirm) → inline errors, stay on screen.
- Settings can switch Contact / Agent / Admin; app opens on last role next launch.
- Sign out → login. Role is **kept**. Next login uses that role, not a reset to contact.
- `getDevUser()` follows stored role (same mock `PEOPLE` as today).
- `pnpm test` covers password rules + session parse. `lib/rbac.test.ts` still passes.
- Splash + launcher icon use the new mark on white. APK rebuild required for native icon/splash.

---

## 2. Phase map

Update `docs/scope.md` + `AGENTS.md` + phase-discipline + expo-router + security (AsyncStorage allowed for this blob only):

0. Scaffold (done)
1. Basic UI mock (done)
2. **Mock auth shell (this spec)** — login/register UI, AsyncStorage `{ email, role }`, splash/icon
3. Real auth — better-auth + expo-secure-store (tokens). Not this spec.
4. Realtime + REST
5. Media, push, i18n, list virtualization

Do not install: better-auth, expo-secure-store, TanStack Query, socket.io, sqlite, Drizzle.

Allowed new dep: `@react-native-async-storage/async-storage` only.

---

## 3. Session (one blob)

```ts
type SessionBlob = {
  email: string | null
  role: UserRole
}
```

- **Logged in** = `email` is a non-empty string.
- **Role** always stored once chosen. Default role when missing: `'contact'`.
- Storage key: one key, e.g. `ism.session`. Parse defensively; corrupt blob → treat as logged out with role `contact`.

| Event | Blob |
|---|---|
| First launch | none → login |
| Login / register (valid) | `{ email, role: existingRole ?? 'contact' }` |
| Settings switch | `{ email, role: next }` then `router.replace(ROLE_HREF[next])` |
| Sign out | `{ email: null, role }` (role unchanged) → login |
| Cold start, email set | `ROLE_HREF[role]` |
| Cold start, email null | login |

No React global store. In-memory copy in `lib/session.ts` after hydrate; AsyncStorage is the source of truth. Root `app/index.tsx` waits for hydrate, then `Redirect`.

Retire compile-time `DEV_ROLE` as the runtime session. `getDevUser()` / inbox / rbac use `session.role`. `DEV_USER_ID` becomes a function (or always derived from `getDevUser().id`) so it is not frozen at import.

Unknown role still throws via `lib/rbac.ts`.

Do not `console.log` email or password.

---

## 4. Login + Register

Same visual system. Two routes: `/(auth)/sign-in`, `/(auth)/register`. Shared form component.

| | Login | Register |
|---|---|---|
| Email | yes | yes |
| Password | yes | yes |
| Confirm password | no | yes |
| Strength meter | no | yes |
| Suggest password | no | yes |
| Footer link | → Register | → Login |

**Email:** non-empty, must look like `local@domain.tld` (simple regex, not RFC theater).

**Password (register + shared validator):** all of: length ≥ 8, uppercase, lowercase, digit, symbol (`[^A-Za-z0-9]`). Login uses the same validator so a weak password cannot “succeed” on login either.

**Strength meter (register only):** count how many of the five rules pass → Weak / Fair / Strong (1–2 / 3–4 / 5). Still require all five to submit.

**Suggest password:** button fills password + confirm with a generated string that passes all five. User can edit after.

**Confirm:** must match password.

Submit: if invalid, inline field errors, no navigation. If valid, write session (keep stored role or `contact`) and `router.replace(ROLE_HREF[role])`. Always succeeds when valid — no error toast for “wrong password”.

Chrome: white `bg`, generated mark above the form, Manrope, primary CTA, `border-line` card. No Casewire / nsave maroon. Do not retoken the whole app from the logo; splash/icon only.

Auth stack: `headerShown: false`. Switch Login ↔ Register with footer text links only (no native header, no `InScreenHeader`).

---

## 5. Settings

All three settings screens compose the same block (still a thin placeholder shell + these controls):

- Role segmented control / three rows: Contact, Agent, Admin. Selected = stored role. On change → persist + `replace` to that group.
- Sign out → `{ email: null, role }` → `replace('/(auth)/sign-in')`.

No profile editor. No real password change.

---

## 6. Splash + app icon

Generate a **new** two-bubble mark (blue + cyan, white ellipsis dots, overlap darker) inspired by `assets/images/logo.png`. Not that file, not “Messenger Chat” wordmark, not “Internal Support Messenger” wordmark.

- Splash: mark centered on `#FFFFFF`.
- App icon / Android adaptive: mark on `#FFFFFF`.

Wire `app.json` splash + `android.adaptiveIcon` + `assets/images` icon/splash files. Rebuild APK after native asset change.

---

## 7. Files

```
lib/session.ts                 # blob type, hydrate, read, write, signOut, test
lib/password.ts                # validate + score + suggest, test
components/auth/auth-form.tsx  # shared login/register form
app/(auth)/sign-in.tsx
app/(auth)/register.tsx
app/index.tsx                  # hydrate → login or ROLE_HREF[role]
components/settings/role-switch.tsx
app/(contact|agent|admin)/settings.tsx  # compose switch + sign out
assets/images/icon.png         # generated mark
assets/images/splash-icon.png  # generated mark
app.json                       # splash + adaptive icon white
```

Plus phase-bump edits: `AGENTS.md`, `docs/scope.md`, `.cursor/rules/phase-discipline.mdc`, `.cursor/rules/expo-router.mdc`, `.cursor/rules/security.mdc` (AsyncStorage for this blob only; still no fake JWT / SecureStore).

Prefer one `SettingsScreen` used by all three settings routes.

---

## 8. Out of scope

better-auth, expo-secure-store, fake JWT, `fetch`, real KB/CMS/analytics, forgot-password, OAuth, theme toggle, changing messenger `primary` token to logo cyan. Agent/Admin hub mocks live in the role-hubs spec.

---

## 9. Guardrails

- Ponytail: no session provider framework. One module + AsyncStorage.
- Security: no logging email/password. No `.env`.
- RBAC matrix unchanged. Capability ≠ new admin screens.
- Contact still has **no tab bar**. Agent/Admin keep tabs.
- Uniwind + existing tokens. No NativeWind. No arbitrary palette hex for UI chrome.
- pnpm. No commit unless asked.
