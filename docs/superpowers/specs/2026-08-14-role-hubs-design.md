# Role hubs — Agent / Admin homepages

**Date:** 2026-08-14  
**Product:** Internal Support Messenger (Expo)  
**Depends on:** Phase 1 Contact hub + Phase 2 mock auth  
**Approach:** Mock-only hub variants. Same chrome as Contact. No real KB/CMS/analytics.

---

## 1. What this builds

After login, homepage follows `getSession().role`.

| Role | Home |
|---|---|
| Contact | Unchanged Phase 1 hub (Support / Messages+Help / Recent / Search / Offers / FAQ) |
| Agent | Same card layout. Headline **Your queue**. Help → Knowledge base. Search → Search knowledge. Offers removed → Unassigned pool card. FAQ stays. Messages card → inbox. |
| Admin | Same card layout. Headline **Overview**. Help → Knowledge base (FAQ add, knowledge add, article list). Offers → mock Charts carousel + detail. FAQ slot → Add offer. Messages card → Conversations tab. |

Login/register stay shared. Role switch in Settings unchanged.

**Done when:**

- Contact hub still looks like Phase 1 (wordmark **SUPPORT**).
- Agent tabs: **Home | Unassigned | Conversations**. Settings is hub gear only.
- Admin tabs: **Home | Users | Unassigned | Conversations**. Users = mock directory (search, role chips, online). Settings is hub gear only.
- Knowledge / add-offer / FAQ add / article / chart are **sibling** screens on the Home stack (native back). No nested knowledge/chart stacks, no custom `headerLeft` back.
- Knowledge Copy uses `expo-clipboard` only. No share sheet.
- Charts are mock series (bar, line, pie, donut) — not web analytics / SLA / audit.
- Add offer / FAQ / knowledge persist in memory until reload; Contact Offers/FAQ read the same catalog.
- `pnpm test` covers catalog + knowledge filter + bar heights + hub routes.

---

## 2. Out of scope

Real CMS, Postgres, TanStack Query, chart libraries, analytics dashboards, audit log, SLA config, assign/transfer/delete/broadcast UI, internal notes.

---

## 3. Navigation

### Agent tabs

**Home | Unassigned | Conversations**

Home = one `(home)` Stack: hub, settings, `knowledge`, `article/[id]`, search, FAQ. Hub gear → settings.

### Admin tabs

**Home | Users | Unassigned | Conversations**

Home = one `(home)` Stack: hub, settings, FAQ, add FAQ/knowledge/offer, `knowledge`, `article/[id]`, `chart/[id]`.

---

## 4. Catalog

`lib/mock-catalog.ts` — seed from `lib/mock-data.ts` plus in-memory extras. `resetCatalog()` for tests. No AsyncStorage.
