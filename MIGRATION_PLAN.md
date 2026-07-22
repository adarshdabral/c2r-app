# MIGRATION_PLAN.md — Web → React Native (Android + iOS)

**Project:** Connect2Recycle — role-based e-waste recycling platform
**Source:** `/App/frontend` (Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui)
**Target:** Cross-platform React Native app (Android + iOS), same backend (`/App/backend`, **unchanged**)
**Nature of work:** Migration, not rewrite. Preserve every workflow, validation, permission, and API contract.

> This is the **Phase 1 analysis deliverable**. No migration code is written yet. Phases 2–3 follow this plan incrementally.

---

## 0. Guiding constraints (from the brief)

1. All work stays inside `/App`. Backend, DB schema, and API contracts are frozen.
2. Speed and safety first, then reuse, then clean architecture, then polish.
3. Minimize dependencies.
4. The web `/frontend` is **kept in place as read-only reference** during the migration; the new app is built in a sibling directory `**/App/mobile**`. This is the safest option — no reference material is destroyed, nothing outside `/App` is touched, and web/mobile can be diffed side-by-side per feature. Once parity is verified, `/frontend` can optionally be archived (a documented, reversible step — not part of this migration).

---

## 1. Recommended React Native architecture

**Expo (managed workflow) + Expo Router.**

| Concern | Choice | Rationale |
|---|---|---|
| Runtime/tooling | **Expo SDK (managed)** | Config-free Android **and** iOS builds, OTA updates, and pre-wired native modules (location, secure storage, maps). Fastest safe path to "runs on both platforms"; avoids hand-maintaining native Xcode/Gradle projects. Prebuild/EAS available later if a bare workflow is ever needed. |
| Navigation | **Expo Router** (file-based) | Directly mirrors the Next.js App Router mental model and folder-per-route layout → the route→screen map is nearly 1:1, maximizing reuse of the existing structure and minimizing translation risk. Uses React Navigation underneath (stacks, tabs, guards). |
| Language | **TypeScript** (strict where practical) | Source is already TS. Reuse types verbatim. |
| HTTP | **axios** (kept) | `lib/api.ts` works in RN with one change (async token storage). Backend contracts unchanged. |
| State | **React hooks + Context** (as today) + **TanStack Query (optional, deferred)** | The web app uses local `useState`/`useEffect` per page with no global store. Keep that model to minimize risk. A thin `AuthContext` replaces the scattered `localStorage` reads. TanStack Query is *optional* later polish for caching list endpoints, not required for parity. |
| Styling | **NativeWind v4** (Tailwind for RN) + a small hand-built primitive kit mirroring the shadcn API | Preserves the existing Tailwind class vocabulary and the "clay" design tokens from `globals.css`, so screen JSX and design intent port with minimal reinterpretation. Keeps dependency count low vs. adopting a full component framework. |
| Forms/validation | **react-hook-form + zod** (kept) | Both run in RN unchanged. Validation rules preserved exactly. |
| Icons | **lucide-react-native** | Drop-in for `lucide-react`; identical icon names → near-zero-effort swap. |

**Why not alternatives (documented tradeoffs):**
- *Bare React Native CLI* — more control, but you hand-maintain two native toolchains; slower and riskier for a parity migration. Rejected for speed/safety.
- *React Native Paper / Tamagui / gluestack (full UI frameworks)* — batteries-included, but each imposes its own design language and a large dependency; porting the bespoke "clay" look would fight the framework. NativeWind + thin primitives keeps the look and the dependency budget small.
- *React Navigation without Expo Router* — viable, but loses the file-based 1:1 mapping with the source App Router, increasing translation effort.

---

## 2. Recommended libraries (and what each replaces)

| Web dependency | Mobile replacement | Notes |
|---|---|---|
| `next` (App Router, `next/link`, `next/navigation`, `next/dynamic`) | `expo-router` | `<Link>`→`expo-router` `<Link>`/`router.push`; `useRouter`/`usePathname` have direct equivalents. `next/dynamic` (map lazy-load) → plain component import (no SSR to defer). |
| `middleware.ts` (cookie-based route guard) | Expo Router layout guards (`_layout.tsx` + `AuthContext`) | Redirect to `/login` when no token; role redirect after auth. |
| `localStorage` (token/role/user_type) | **`expo-secure-store`** (token) + **`@react-native-async-storage/async-storage`** (role, user_type, non-sensitive) | Token is a credential → SecureStore (Keychain/Keystore). Async API requires an in-memory cache hydrated at boot (see §6). |
| Cookies (`withCredentials`, `token` cookie) | **Dropped** — Bearer header only | Backend already accepts `Authorization: Bearer`. RN has no cookie jar; Bearer is the single transport. **No API contract change.** |
| `leaflet` + `react-leaflet` + `leaflet.markercluster` | **`react-native-maps`** (+ `react-native-map-clustering`) | Apple Maps (iOS) / Google Maps (Android). Keep OSM raster tiles via `UrlTile` to match the existing look, or use native tiles. Markers, `Polyline`, `Callout` cover current features. |
| `navigator.geolocation` | **`expo-location`** | "Use my location" + permission prompts. |
| OSRM route fetch, Nominatim geocode (`lib/geocode.ts`) | **Kept as-is** — plain `fetch` | Works unchanged in RN. Add a required `User-Agent`-style header note per Nominatim policy. |
| `sonner` (toasts) | **`react-native-toast-message`** (or Burnt) | Wrap behind the existing `use-toast` hook shape so call sites are unchanged. |
| `recharts` (admin charts) | **`react-native-svg`** + lightweight custom charts (or `victory-native`) | Admin has a small number of charts; start with SVG stat visuals, add victory-native only if needed. |
| `framer-motion` | **`react-native-reanimated`** (Expo-bundled) + `Moti` (optional) | Most animations are decorative; port only what affects UX. |
| Radix UI primitives (`@radix-ui/*`), `vaul`, `cmdk`, `embla`, `react-day-picker` | **Hand-built native primitives** on RN core + a few focused libs | RN Modal/ActionSheet/Picker replace Dialog/Drawer/Select; `@react-native-community/datetimepicker` replaces the calendar; native `FlatList` replaces carousels/command lists. |
| `date-fns` | **Kept** | Pure JS, runs in RN. |
| Tailwind v4 (`@tailwindcss/postcss`, `globals.css` CSS vars) | **NativeWind v4** + a `tailwind.config.js` carrying the same design tokens | Port CSS variables (colors, radius, "clay" shadows) into the Tailwind theme + a few RN `StyleSheet` shadow presets (CSS box-shadow → RN `shadow*`/`elevation`). |

**New dev/runtime deps (kept minimal):** `expo`, `expo-router`, `expo-secure-store`, `expo-location`, `@react-native-async-storage/async-storage`, `react-native-maps`, `react-native-map-clustering`, `nativewind` + `tailwindcss`, `lucide-react-native`, `react-native-toast-message`, `react-native-svg`, `@react-native-community/datetimepicker`, `react-native-safe-area-context`, `react-native-screens`, `react-native-reanimated`. **Kept from source:** `axios`, `zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `clsx`, `tailwind-merge`.

---

## 3. Folder structure (`/App/mobile`)

```
/App/mobile
├── app/                          # Expo Router routes (mirrors app/ from web)
│   ├── _layout.tsx               # Root: providers (Auth, Toast, SafeArea), splash
│   ├── index.tsx                 # Landing (was app/page.tsx)
│   ├── (auth)/                   # Public auth group
│   │   ├── login.tsx
│   │   ├── register.tsx          # form + OTP stages
│   │   ├── forgot-password.tsx
│   │   └── reset-password.tsx
│   ├── (user)/                   # Guarded: role === "user" — tab navigator
│   │   ├── _layout.tsx           # Bottom tabs (from USER_NAV) + auth+role guard
│   │   ├── dashboard.tsx
│   │   ├── stores/index.tsx
│   │   ├── stores/[storeId].tsx
│   │   ├── pickup/new.tsx
│   │   ├── pickup/mine.tsx
│   │   ├── dropoff/index.tsx
│   │   ├── dropoff/mine.tsx
│   │   ├── booking.tsx
│   │   └── profile.tsx
│   ├── (recycler)/               # Guarded: role === "recycler" — tabs
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # dashboard
│   │   ├── pickups.tsx
│   │   ├── dropoffs.tsx
│   │   └── stores.tsx
│   └── (admin)/                  # Guarded: role === "admin"
│       ├── _layout.tsx
│       └── index.tsx
├── src/
│   ├── lib/                      # REUSED logic (copied, minimally adapted)
│   │   ├── api.ts                # axios + all types (async token interceptor)
│   │   ├── auth.ts               # token/role/user_type storage helpers
│   │   ├── userTypes.ts          # verbatim
│   │   ├── india-locations.ts    # verbatim
│   │   ├── geocode.ts            # verbatim (Nominatim/OSRM via fetch)
│   │   └── utils.ts              # cn() etc.
│   ├── context/AuthContext.tsx   # session state + guards
│   ├── components/
│   │   ├── ui/                   # native primitives (Button, Input, Card, Badge, Sheet, Select, ...)
│   │   ├── map/StoreMap.tsx      # react-native-maps port of store-map.tsx
│   │   ├── location/LocationPicker.tsx
│   │   ├── OtpEntry.tsx / OtpDisplay.tsx
│   │   └── StatusBadge.tsx / StatsCard.tsx
│   ├── features/                 # per-feature hooks/helpers (data fetching)
│   └── hooks/                    # use-toast, use-location, etc.
├── assets/
├── app.json / app.config.ts      # Expo config (name, icons, permissions, maps keys)
├── tailwind.config.js            # NativeWind theme = ported design tokens
├── babel.config.js               # nativewind + reanimated plugins
├── tsconfig.json                 # @/* path alias → src
└── package.json
```

---

## 4. Route → Mobile screen mapping

| Web route | Mobile route (Expo Router) | Navigator | Guard |
|---|---|---|---|
| `/` (`app/page.tsx`) | `app/index.tsx` | Root stack | Public |
| `/login` | `app/(auth)/login.tsx` | Auth stack | Public (redirect to role home if session) |
| `/register` | `app/(auth)/register.tsx` | Auth stack | Public |
| `/forgot-password` | `app/(auth)/forgot-password.tsx` | Auth stack | Public |
| `/reset-password` | `app/(auth)/reset-password.tsx` | Auth stack | Public |
| `/dashboard` (redirector) | `(user)/_layout` index resolver | — | user |
| `/dashboard/individual\|business\|bulk` | `(user)/dashboard.tsx` (variant via `user_type`) | User tabs | user |
| `/stores` | `(user)/stores/index.tsx` | User tabs | user |
| `/stores/[storeId]` | `(user)/stores/[storeId].tsx` | User stack (pushed) | user |
| `/pickup/new` | `(user)/pickup/new.tsx` | User tabs | user |
| `/pickup/mine` | `(user)/pickup/mine.tsx` | User tabs | user |
| `/dropoff` | `(user)/dropoff/index.tsx` | User tabs | user |
| `/dropoff/mine` | `(user)/dropoff/mine.tsx` | User stack | user |
| `/booking` | `(user)/booking.tsx` | User stack | user |
| `/profile` | `(user)/profile.tsx` + recycler tab | Both | user + recycler |
| `/recycler` | `(recycler)/index.tsx` | Recycler tabs | recycler |
| `/recycler/pickups` | `(recycler)/pickups.tsx` | Recycler tabs | recycler |
| `/recycler/dropoffs` | `(recycler)/dropoffs.tsx` | Recycler tabs | recycler |
| `/recycler/stores` | `(recycler)/stores.tsx` | Recycler tabs | recycler |
| `/admin` | `(admin)/index.tsx` | Admin stack/tabs | admin |

**Navigation model:** web sidebar (`navConfig.tsx`) → **bottom tab bars** per role (mobile-native), with secondary screens pushed onto the stack. The `USER_NAV` / `recyclerNav` groups map to tab items; the `inboxBadge` maps to a tab badge.

---

## 5. Component migration matrix

### ✅ Reusable verbatim / near-verbatim (pure logic, no DOM)
- `lib/userTypes.ts`, `lib/india-locations.ts`, `lib/geocode.ts` (fetch-based), `lib/utils.ts` (cn)
- `lib/api.ts` **types** (all `Store`, `PickupRequest`, `DropOffRequest`, `Booking`, `Dispute`, `AdminStats`, … — copied 1:1); axios instance adapted (§6)
- `lib/auth-schemas.ts` zod primitives (reuse the validators; note the seller/customer schema is **dead code** — see §8)
- Business constants: waste types, status enums, `nextStatusMap` equivalents

### 🟡 Partially reusable (keep logic, swap presentation)
- **All 23 page components** — the data-fetching logic (`api.*` calls, state machines, validation, derived state, pagination handling) ports directly; only the JSX and Tailwind-on-DOM turns into RN `<View>`/`<Text>`/`FlatList` + native primitives.
- `OtpEntry.tsx` / `OtpDisplay.tsx` — logic identical; input becomes a native OTP field.
- `location-cascade.tsx` / `location-picker.tsx` — cascade logic reused; `<select>`/inputs → native pickers + map tap.
- `status-badge.tsx`, `stats-card.tsx` — trivial re-skin.
- `dashboard/Sidebar.tsx` + `navConfig.tsx` — nav data reused; renders as bottom tabs instead of a sidebar.
- `SavedAddresses.tsx`, `ProfileMenu.tsx` — logic reused; list/menu → RN `FlatList`/ActionSheet.

### 🔴 Rewrite required (web-only tech)
- `store-map.tsx` / `station-map.tsx` — Leaflet → `react-native-maps` (markers, clustering, OSRM polyline, recenter). Logic (OSRM fetch, fallback line, selection) is portable; the rendering layer is new.
- `components/ui/*` (60 shadcn/Radix files) — **not portable**. Build a **focused subset** as native primitives: Button, Input, Textarea, Label, Card, Badge, Select, Sheet/Modal, Dialog/AlertDialog, Tabs, Switch, Checkbox, RadioGroup, Skeleton, Toast, Progress, Avatar, Separator, Calendar/DatePicker, Slider, Table→FlatList. (Unused shadcn files are dropped, not ported.)
- `theme-provider.tsx` (`next-themes`) → RN color-scheme context.
- `analytics-wrapper.tsx` (`@vercel/analytics`) → drop or swap for Expo-compatible analytics (optional).
- `motion-wrapper.tsx`, `sonner.tsx`, `chart.tsx` (recharts), `sidebar.tsx`, `ios-time-wheel.tsx`, `slot-scheduler.tsx`, `clay-calendar.tsx` → native equivalents where a screen actually uses them.

---

## 6. Browser / Web API replacement strategy

| Web API | Where used | Mobile strategy |
|---|---|---|
| `localStorage` (token/role/user_type) | `api.ts`, login, register, dashboard redirect, profile, navbar | Token → `expo-secure-store`; role/user_type → AsyncStorage. Since storage is **async** but the axios request interceptor is sync, hydrate an **in-memory `authStore` at app boot** and read it synchronously in the interceptor; write-through to SecureStore/AsyncStorage on login/logout. |
| Cookies (`token` cookie, `withCredentials`) | auth transport, `middleware.ts` | Dropped; Bearer header only (backend supports it). Route guard moves to `AuthContext` + Expo Router `_layout` redirects. |
| `window.location.href = "/login"` (401 interceptor) | `api.ts` | Replace with a navigation callback registered by the root layout (`router.replace("/login")`) + clearing `authStore`. |
| `navigator.geolocation` | stores, pickup/new, dropoff, booking, location-picker | `expo-location` (`requestForegroundPermissionsAsync` + `getCurrentPositionAsync`). |
| Leaflet DOM maps | 4 pages + 2 map components | `react-native-maps`. |
| `fetch` (OSRM/Nominatim) | `geocode.ts`, `store-map.tsx` | Works unchanged in RN. |
| `File` / FormData uploads | only in **dead** `auth-schemas.ts` / `auth-types.ts` | Not needed — the live registration sends JSON only. If future avatar/store-image upload is added, use `expo-image-picker` + FormData. |
| `document`/`window` misc, CSS `:hover`, `overflow` scroll | layout/styling | RN layout (Flexbox default), `Pressable` states, `ScrollView`/`FlatList`. |
| `next/dynamic` SSR-deferred map import | map pages | Plain import; no SSR in RN. |

---

## 7. Feature migration order (speed- and risk-optimized)

Foundation must land before features; within features, auth unblocks everything, then the highest-reuse user flows, then role dashboards.

**Phase 2 — Foundation (no user-facing feature yet):**
0. Scaffold Expo app, Expo Router, NativeWind + design tokens, tsconfig `@/*` alias.
1. Port `lib/` (api.ts async interceptor, auth storage, userTypes, geocode, india-locations, utils).
2. `AuthContext` + route guards + role redirect + Toast/SafeArea providers.
3. Native UI primitive kit (Button, Input, Card, Badge, Select, Sheet, Tabs, Skeleton, Toast, DatePicker…).
4. `StoreMap` (react-native-maps) + `LocationPicker` + `expo-location` hook.

**Phase 3 — Features (in this order):**
1. **Authentication** (login) — unblocks everything; exercises storage + guards + api.
2. **Registration + OTP** — reuses auth infra; validates the OTP primitive.
3. **Password reset** (forgot + reset) — small, closes the auth surface.
4. **Shared API layer verification** — confirm every endpoint/type against the running backend before building on it.
5. **User dashboard** (redirector + individual/business/bulk variants).
6. **Stores** (list + search/filter/sort/pagination + map + `[storeId]` detail + reviews) — highest-value, exercises maps, lists, and reviews together.
7. **Pickup requests** (new + mine + status machine + OTP handshake).
8. **Drop-off requests** (index + mine + store selection + OTP handshake).
9. **Bookings** (legacy flow).
10. **Profile** (details, password change, saved addresses).
11. **Recycler dashboard** (overview).
12. **Admin dashboard** (stats, stores moderation, users, disputes, thresholds, charts).
13. **Reviews** (create/edit/delete — largely folded into Stores in step 6; finalize here).
14. **Disputes** (raise + admin resolve).
15. **Notifications** (in-app surfacing; push is a documented optional extension).
16. **Remaining** (footer/landing polish, empty/error/loading passes, animations).

Rationale: each step reuses infrastructure proven by the previous one; maps and OTP (the two riskiest replacements) are introduced early behind small, well-scoped screens.

---

## 8. Risks, blockers, and assumptions

**Assumptions**
- The backend runs unchanged and is reachable at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`). Mobile uses `EXPO_PUBLIC_API_URL`; **on a device/emulator `localhost` won't reach the host** — use the LAN IP (or `10.0.2.2` for Android emulator). Documented in `VERIFY.md`.
- Backend already accepts `Authorization: Bearer` (confirmed in `middleware/authMiddleware.js` per CLAUDE.md) so dropping cookies is safe.
- OTPs are emailed and never returned in API bodies (except the owner's own pickup/dropoff `otp` field) — mobile keeps that contract; no OTP is inferred client-side.
- `auth-types.ts` and `auth-schemas.ts` describe a **legacy marketplace seller/customer flow that the live pages do not use** — the real register flow is `{name,email,password,role,user_type}`. These are treated as dead code and **not** migrated (only the reusable zod validators are salvaged).

**Risks / blockers**
- **Async storage vs. sync interceptor** — mitigated by the in-memory `authStore` hydrated at boot (§6). Must hydrate before the first guarded navigation to avoid a login flash.
- **Maps API keys** — `react-native-maps` on Android needs a Google Maps API key in `app.config`. Mitigation: use OSM `UrlTile` (no key) to match the current OSM look; document the key path if native Google tiles are chosen.
- **Nominatim/OSRM usage policy** — public endpoints rate-limit; keep caller debounce and set an identifying header. Fine for dev/demo; production should self-host or use a keyed provider (already noted in the source).
- **Design-token fidelity** — the bespoke "clay" claymorphism (layered box-shadows, insets) maps imperfectly to RN shadows (`shadowColor/Offset/Opacity/Radius` + Android `elevation`). Mitigation: a small set of shadow presets; accept minor visual drift, preserve hierarchy.
- **Admin charts** — `recharts` has no RN equivalent that's a drop-in; mitigation: start with SVG stat tiles, add `victory-native` only if a specific chart requires it.
- **Deep-link / role-mismatch** — web relied on client-side role checks after a cookie-only middleware. Mobile centralizes this in `AuthContext` guards; ensure every group `_layout` enforces its role to avoid cross-role access.
- **Scope of `components/ui`** — 60 shadcn files exist but many are unused by the 23 pages. Mitigation: build only the primitives the pages actually import (audit per-feature) to avoid porting dead UI.
- **No push infra in backend** — "Notifications" today are emails + in-app polling. True push (APNs/FCM) would need backend work, which is **out of scope** (backend frozen). Mobile will surface notifications in-app; push is documented as a future extension.

---

## 9. Verification approach (maintained in `/App/VERIFY.md`)

Each migrated feature is verified against the running backend: how to run, per-feature test steps, edge cases (expired OTP, 401 redirect, empty lists, offline/error states, permission-denied geolocation), and known limitations. `VERIFY.md` is created and updated incrementally starting in Phase 2.

---

## 10. Next step

Proceed to **Phase 2 — Foundation Setup** (scaffold `/App/mobile`, port `lib/`, wire Auth + navigation + primitives + maps). No feature screens until the foundation compiles and the API layer is verified against the backend.

---

## 11. Execution outcome (migration complete)

Delivered **in place** in `/App/frontend` (user-chosen; the web source was staged under `web-reference/` during the migration and removed at the end — the original is preserved at `../../may7/frontend`). Stack: **Expo SDK 57 + Expo Router + NativeWind + TypeScript**.

**Decisions that differed from the initial plan (with rationale):**
- **`/App/frontend` in place**, not `/App/mobile` (user choice).
- **Role routing uses real path segments** `/recycler/*` and `/admin`, with `(user)` as an invisible group (bare URLs). Route *groups* don't add URL segments, so keeping all three as groups made `(user)/(tabs)/stores` and `(recycler)/(tabs)/stores` both resolve to `/stores` (a collision), and `(recycler)/(tabs)/index` collide with the landing at `/`. Real segments remove every collision **and** match the web's URLs. This is the one structural change from the plan's folder sketch.
- **Per-type dashboards consolidated** into one adaptive `/dashboard` tab (varies copy by `user_type`) instead of `/dashboard/individual|business|bulk`.

**Verification:** `npx tsc --noEmit` clean; `npx expo export` bundles both **iOS (3771 modules)** and **Android (3871 modules)**. No web-only APIs (`localStorage`/`window`/`react-leaflet`/`recharts`/`@radix`) remain in the app graph. Full run/test guide + documented limitations in `/App/VERIFY.md`.

**Scope note:** the web frontend had no standalone Notifications or user/recycler "raise dispute" screens, so none were invented — notifications surface in-app (recycler dashboard/profile) and disputes are admin list/resolve, matching web parity.
```
