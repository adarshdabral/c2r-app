# Architecture

Connect2Recycle (**CTR**) is a role-based e-waste recycling platform that connects waste generators (**users**) with **recyclers**, supervised by an **admin** role. It is a monorepo of two independent npm projects, `backend/` (Express + MySQL REST API) and `frontend/` (Expo / React Native mobile app). There is no root tooling — each app is run from its own directory.

```
+-----------------------+       HTTPS / JSON        +--------------------------+      TCP       +---------+
|  Expo / React Native  | <-----------------------> |  Express REST API        | <------------> |  MySQL  |
|  app (Expo Go / build) |  Authorization: Bearer …  |  (port 4000, /api/*)     |  mysql2 pool   |         |
|  Expo Router + NW v4   |                           |  JWT auth, strict MVC    |  (limit 10)    |         |
+-----------------------+                           +--------------------------+                +---------+
        |                                                    |
        | react-native-maps (OSM tiles)                      | best-effort, server-side only
        v                                                    v
   Map UI on device                              Rewards ledger (Hyperledger Fabric
                                                 REST bridge, x-api-key) + SMTP email
```

The frontend was migrated from a Next.js 16 web app to Expo / React Native in place; API contracts were preserved. The backend uses **Bearer-token** auth (it also still accepts a `token` cookie, unused by the mobile client).

---

## 1. Backend — `backend/`

Node + Express REST API. Entry point: `backend/server.js`. It mounts eleven routers under `/api/*` plus a health probe, applies CORS (`CORS_ORIGIN` || `http://localhost:3000`, credentials enabled), JSON body parsing, a request logger, an auth-only rate limiter, and a central error handler. On boot it calls `createTables()` (idempotent schema) then `app.listen(PORT)`, and starts the pickup sweeper. `server.js` only self-boots when run directly (`require.main === module`) and exports `{ app, createTables }` so tests can import the app via supertest.

### 1.1 Layering (strict MVC + services)

```
routes/  →  controllers/  →  models/  →  config/db.js (mysql2 pool)
                    ↘  services/  (rewards ledger)  ↘  utils/ (ApiError, asyncHandler, query, email, logger, wasteCategories)
```

- `routes/*Routes.js` — Express routers; the only place `protect` / `requireRole(...)` is composed.
- `controllers/*Controller.js` — validation, role checks, status-transition logic, response shaping; wrap async handlers in `utils/asyncHandler` (rejections reach the error middleware).
- `models/*Model.js` — every SQL query. Controllers never import `db` directly.
- `services/` — `rewardsLedger.js` (thin client for the Fabric REST bridge) and `rewardsService.js` (award rules).
- `config/db.js` — single `mysql2/promise` pool (`connectionLimit: 10`).

**One documented exception:** `controllers/adminController.js` imports `db` directly to compose overview aggregations in one handler. Keep that pattern only for new admin aggregations; everything else goes through a model.

### 1.2 Modules

| Router (`routes/`)          | Controller                     | Primary model(s)                        | Mount                    |
| --------------------------- | ------------------------------ | --------------------------------------- | ------------------------ |
| `authRoutes.js`             | `authController.js`            | `userModel.js`                          | `/api/auth`              |
| `storeRoutes.js`            | `storeController.js`           | `storeModel.js`, `reviewModel.js`       | `/api/stores`            |
| `pickupRequestRoutes.js`    | `pickupRequestController.js`   | `pickupRequestModel.js`, `otpVerificationModel.js` | `/api/pickup-requests`   |
| `dropOffRequestRoutes.js`   | `dropOffRequestController.js`  | `dropOffRequestModel.js`, `otpVerificationModel.js` | `/api/dropoff-requests`  |
| `bookingRoutes.js`          | `bookingController.js`         | `bookingModel.js`                       | `/api/bookings` (legacy) |
| `addressRoutes.js`          | `addressController.js`         | `addressModel.js`                       | `/api/addresses`         |
| `disputeRoutes.js`          | `disputeController.js`         | `disputeModel.js`                       | `/api/disputes`          |
| `rewardRoutes.js`           | `rewardController.js`          | `settingsModel.js` + `services/*`       | `/api/rewards`           |
| `stationRoutes.js`          | `stationController.js`         | `stationModel.js`                       | `/api/stations` (legacy) |
| `recyclerRoutes.js`         | `recyclerController.js`        | `userModel.js`, `storeModel.js`         | `/api/recyclers`         |
| `adminRoutes.js`            | `adminController.js`           | (direct `db` + several models)          | `/api/admin`             |

Cross-cutting utilities (`utils/`): `ApiError` (operational errors + `statusCode`), `asyncHandler`, `query.js` (pagination/sort/search with whitelisted ORDER BY columns), `logger.js` (JSON logger gated by `LOG_LEVEL`), `sendEmail.js` / `emailTemplates.js` (nodemailer; sends are best-effort, never block the request path), `wasteCategories.js` (multi-category normalizer), `generateToken.js`.

### 1.3 Database schema

Defined inline in `server.js`'s `createTables()`. **No migration tool** — `CREATE TABLE IF NOT EXISTS` only affects fresh DBs; additive columns use an idempotent `ensureColumn()` helper, and a couple of one-off `ALTER … MODIFY`s run on boot. Plan manual migrations for column changes against an existing DB.

Tables (12):

| Table                       | Purpose |
| --------------------------- | ------- |
| `users`                     | Accounts. `role ENUM('user','recycler','admin')`; within `user`, a `user_type` (`individual`/`small_business`/`bulk_producer`). OTP + `is_verified` + `is_suspended` + password-reset columns. |
| `stores`                    | Core entity. A recycler owns many; each has coords, `accepted_waste_types` (MySQL `SET` of the 9 e-waste categories), capacity, `status` (Active/Inactive), `verification_status` (Pending/Verified/Rejected), `rating`/`total_reviews`, admin `daily_threshold_kg`. |
| `pickup_requests`           | Broadcast/auction requests. `waste_category` holds a **comma-separated list** of categories (multi-select). Status machine + two-sided OTP columns + `actual_quantity_kg`. |
| `pickup_request_candidates` | The per-round broadcast fan-out (which stores a request was offered to). |
| `dropoff_requests`          | User picks a specific store + slot; that store's recycler approves. Same multi-category + OTP columns; `recycler_id` denormalised from the store. |
| `bookings`                  | Original/legacy pickup flow. Still present; targets a `store_id` (nullable legacy `station_id` FK ignored by the create path). |
| `reviews`                   | One per (store, user) — UNIQUE index; `stores.rating`/`total_reviews` recomputed on write. |
| `otp_verification_log`      | Append-only audit of every OTP attempt; polymorphic over `request_type` (pickup/dropoff), no FK. |
| `disputes`                  | Either party raises an issue against a pickup/dropoff (polymorphic) for admins to resolve. |
| `user_addresses`            | A citizen's saved pickup locations (≤1 default per user). |
| `app_settings`              | Key/value flags. Backs the admin-controlled `rewards_enabled` toggle (default off). |
| `stations`                  | Legacy admin-managed entity that predates stores; largely unused. |

Migration scripts: `scripts/migrate-waste-categories.sql` (switch the `stores.accepted_waste_types` SET members to the 9 e-waste categories — **must be run once on an existing DB**) and `scripts/migrateRecyclersToStores.js` (backfill a default store per legacy recycler, idempotent).

### 1.4 Auth model

- **Registration is OTP-gated.** `register` creates the account and emails a 6-digit OTP; `verifyOTP` sets `is_verified`; `resendOTP` reissues. `admin` cannot self-register.
- **Login** refuses unverified (`is_verified`) or `is_suspended` accounts. It returns the JWT in the JSON body **and** sets an `httpOnly` `token` cookie (the mobile client uses the body/localStorage token; the cookie is for parity).
- **`protect`** reads the JWT from `Authorization: Bearer …` or the `token=` cookie, verifies with `JWT_SECRET`, sets `req.user = { id, role }`.
- **`requireRole(...roles)`** is composed after `protect` on gated routes.
- **Rate limit** — `express-rate-limit` on `/api/auth/*` only, **skipped when `NODE_ENV` is `development` or `test`** (so tests aren't throttled).

### 1.5 The four request-like flows

The domain has four parallel flows, each its own routes→controller→model triad:

- **Stores** (`/api/stores`) — the core entity (see schema). `getNearestStores` filters to `status='Active' AND verification_status='Verified'`.
- **Pickup requests** (`/api/pickup-requests`) — a broadcast/auction. A user raises a request; the platform broadcasts it to the top-N nearest Active+Verified stores that accept **all** selected categories and have capacity; the first recycler to accept wins. Status: `REQUESTED → BROADCASTED → ACCEPTED → EN_ROUTE → ARRIVED → OTP_PENDING → COMPLETED` (+ `CANCELLED`/`EXPIRED`). A background sweeper (`runPickupSweep`, `PICKUP_SWEEP_INTERVAL_MS` default 30s) re-broadcasts past-deadline requests to the next-nearest stores or expires them.
- **Drop-off requests** (`/api/dropoff-requests`) — no broadcast; the user picks a store + slot and that store's recycler approves. Status: `REQUESTED → APPROVED → CHECKED_IN → OTP_PENDING → COMPLETED` (+ `CANCELLED`).
- **Bookings** (`/api/bookings`) — legacy. A recycler claims one via `assignRecycler()`, an atomic `UPDATE … WHERE recycler_id IS NULL OR recycler_id = ?` that prevents races (`affectedRows=0` → 403). Transitions constrained by `nextStatusMap`: `pending → accepted → completed`.

**Mutual OTP handshake** — pickup and drop-off completion are gated by a two-sided OTP: each side has a code (`otp_user`/`otp_recycler`) with `otp_expiry`, an `otp_attempts` counter, and per-side verified flags. The recycler enters the customer's code and logs the **actual collected quantity** to complete. Every attempt is appended to `otp_verification_log`. **OTPs are never serialised to API responses** except the owner's own handover code on their `/mine` view.

### 1.6 Rewards ledger (blockchain)

An **opt-in** feature (admin toggle `app_settings.rewards_enabled`, default **off**). On a completed pickup/drop-off, `services/rewardsService.awardForCompletion()` runs **best-effort, fire-and-forget** (like email — never blocks or rolls back the recycle): if enabled and the ledger is configured, it awards `round(actualQuantityKg × REWARDS_POINTS_PER_KG)` points to the user's ledger account (`user_<id>`) via `services/rewardsLedger.js` (a Hyperledger Fabric REST bridge, `x-api-key`, held **server-side only**). Users read their balance + on-chain history via `/api/rewards/me` and `/api/rewards/me/history`; `/api/rewards/status` tells the app whether to show the feature.

### 1.7 Geo queries

`getNearestStores` (`storeModel.js`) and `getNearestStations` (`stationModel.js`) compute Haversine distance in SQL with `ACOS/COS/SIN(RADIANS(...))` and Earth radius **6371 km**. The bind order is **`lat, lng, lat`** (lat twice, lng once) — preserve it. `getNearestStores` also ANDs a `FIND_IN_SET` per requested waste type (store must accept all).

### 1.8 REST surface (selected)

| Method | Path                                   | Auth            | Notes |
| ------ | -------------------------------------- | --------------- | ----- |
| GET    | `/api/health`                          | public          | Liveness |
| POST   | `/api/auth/register` · `/verify-otp` · `/resend-otp` · `/login` · `/logout` | public (rate-lim.) | OTP-gated registration |
| GET/PUT| `/api/auth/profile`                    | any role        | `{ name, email, role, user_type }` |
| GET    | `/api/stores/nearest`                  | any role        | `?lat=&lng=` (+ filters) |
| GET    | `/api/stores/:id` · `/:id/reviews`     | any role        | Detail + reviews |
| POST   | `/api/pickup-requests`                 | user            | Multi-category; auto-broadcast |
| GET    | `/api/pickup-requests/mine` · `/inbox` | user · recycler | Owner view / recycler inbox |
| POST   | `/api/pickup-requests/:id/accept` · `/collect` | recycler | Accept / OTP-complete |
| POST   | `/api/dropoff-requests` · `/:id/approve` · `/collect` | user · recycler | Create / approve / complete |
| GET    | `/api/rewards/status` · `/me` · `/me/history` | user     | Feature flag / balance / on-chain trail |
| GET/PATCH | `/api/admin/overview` · `/settings` · `/settings/rewards` · `/users` · `/stores` · `/disputes` | admin | Overview, feature flags, moderation |

### 1.9 Environment

`backend/.env` (see `backend/.env.example`) requires `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`. Email needs `EMAIL_HOST`/`PORT`/`USER`/`PASS`/`FROM`. Rewards needs `REWARDS_LEDGER_URL`, `REWARDS_LEDGER_API_KEY`, `REWARDS_POINTS_PER_KG`. Optional: `CORS_ORIGIN`, `LOG_LEVEL`, `PICKUP_SWEEP_INTERVAL_MS`, `NODE_ENV`. **`.env` and `key.pem` are gitignored** — never commit secrets.

---

## 2. Frontend — `frontend/`

Expo SDK 54 + Expo Router 6 + React Native 0.81 + React 19 + TypeScript. Styling: **NativeWind v4** (Tailwind classes in RN; CSS-variable theme in `global.css` + `tailwind.config.js`). Animation: **react-native-reanimated 4** + `react-native-svg` + `expo-linear-gradient`. Maps: **react-native-maps** (works in Expo Go). Also `axios`, `zod`, `react-hook-form`, `date-fns`, `expo-location`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `lucide-react-native`, `@expo-google-fonts/fraunces`.

### 2.1 Route layout (role-routed)

Role separation uses `(user)` as an **invisible route group** (bare URLs like `/dashboard`, `/stores`) while `recycler` and `admin` are **real path segments** (to avoid Expo Router URL collisions).

```
app/
  _layout.tsx        root: font load, providers, auth+role guard (useProtectedRoute)
  index.tsx          landing
  (auth)/            login, register, forgot/reset password
  (user)/            (tabs): dashboard, stores, pickups, dropoff, profile
                     + pushed: pickup/new, dropoff/mine, stores/[id], booking,
                       rewards, notifications
  recycler/          recycler console (tabs)
  admin/             admin dashboard
```

### 2.2 Auth gating

There is **no web middleware**. Two layers keep sessions honest:

1. **`app/_layout.tsx` (`useProtectedRoute`)** — redirects unauthenticated users out of protected groups to `/login`, and authenticated users to their role home (`homeRouteFor` in `src/context/AuthContext.tsx`). Role-mismatch is enforced client-side.
2. **`src/lib/api.ts` axios instance** — attaches `Authorization: Bearer <token>` from an in-memory cache (hydrated at boot); on a live-session `401` it clears the session and routes to `/login`. A 15s timeout surfaces network errors instead of hanging.

Token → `expo-secure-store`; role/user_type → AsyncStorage. `EXPO_PUBLIC_API_URL` must point at the dev machine's **current LAN IP** on a physical phone (`npm start` auto-syncs it via `scripts/start.mjs`).

### 2.3 Design system

- **Typography (signature):** **Fraunces** display serif for titles + all numerals (`font-display` tokens; loaded in `_layout`); system sans for body/UI. `CountUp` numerals default to Fraunces.
- **Motion primitives** (`src/components/motion/`): `PressableScale` (spring press), `CountUp` (60fps count-up), `ProgressRing` (SVG eco ring), `Floaty`/`Pulse` (ambient loops), `Shimmer` (skeletons).
- **Coded color** (`src/lib/domains.ts`): each flow owns a hue — pickups emerald, drop-offs teal, stores indigo, rewards amber, impact emerald→teal. `GradientHeader` anchors each screen; a Home quick-action tile's color equals its destination's header color (continuity).
- **Clay surfaces** (`components/ui/Surface`) on a mist canvas; primitives (`LoadingState` = shimmer, `EmptyState` = editorial) live in `src/components/ui/`.

### 2.4 App-level features

- **Notifications** (`src/lib/notifications.ts` + `app/(user)/notifications.tsx`) — a client-synthesized feed from the user's own pickups/drop-offs, surfacing status updates and the owner's handover OTPs (no new OTP exposure). A dashboard bell shows an unread badge (last-seen in AsyncStorage).
- **Onboarding tours** (`src/lib/tutorials.ts` + `TutorialLauncher`) — per role/user-type walkthroughs that auto-show once on first login.

### 2.5 Build & types

`next.config` is gone (RN). Gates: `npx tsc --noEmit` and `npx expo export --platform ios` (bundle check). Run one Vitest file if unit tests apply. Maps/animation libs are Expo-Go-safe; **do not add react-native-skia / Lottie / native confetti** (not in Expo Go).

---

## 3. End-to-end flow: a pickup

1. **User** taps *Schedule a pickup*, selects one-or-more e-waste categories + total quantity + location, and `POST /api/pickup-requests`. The backend validates, stores the categories comma-joined, and **broadcasts** to the top-N nearest Active+Verified stores that accept every category and have capacity (`pickup_request_candidates` records the fan-out).
2. **Recyclers** see the offer in their inbox; the first to `POST /:id/accept` wins (`ACCEPTED`). Others see it gone. The sweeper re-broadcasts anything past its deadline.
3. Recycler marks `EN_ROUTE`/`ARRIVED`, then arms OTP (`OTP_PENDING`); the customer's dashboard/notifications show their code.
4. At handover the recycler `POST /:id/collect` with the customer's OTP + the **actual** collected quantity → `COMPLETED`. Capacity updates; every OTP attempt is logged.
5. If rewards are enabled, `awardForCompletion` grants points on-chain (best-effort). The user sees the new balance + history under **Rewards**.
6. **Admin** monitors requests, verifies stores, resolves disputes, and toggles features via `/api/admin/*`.

---

## 4. Deployment

- **CI/CD** (`.github/workflows/ci-cd.yml`) — on push/PR to `main`: frontend (vitest + build check), backend (`node --check` sweep + coverage), backend-integration (supertest vs a `mysql:8.4` service). On push to `main`, after all pass, an SSH deploy to EC2 runs `scripts/deploy.sh`.
- **Backend on Render** (`render.yaml`) — a `web` service with `rootDir: backend`, `buildCommand: npm install`, `startCommand: npm start`; binds `process.env.PORT`. Render has **no managed MySQL**, so `DB_*` must point at an external MySQL (PlanetScale/Aiven/Railway/RDS); the server runs `createTables()` on boot and won't start without a reachable DB.
- **Frontend** — a mobile app: run in **Expo Go** (`npm start`) or a native/EAS build. It is **not** a web service (react-native-maps has no web support).

---

## 5. Cross-cutting things to watch

- **Schema lives in `server.js`'s `createTables()`** — no migration tool. `CREATE TABLE IF NOT EXISTS` only affects fresh DBs; use `ensureColumn()` for additive changes and plan manual migrations otherwise. Run `scripts/migrate-waste-categories.sql` on any existing DB so store categories match the canonical 9.
- **OTPs are never serialised to clients** except the owner's own handover code on `/mine`. Don't add OTP fields to response shapes.
- **Race-safe claim + Haversine bind order** are load-bearing — preserve the `assignRecycler` `UPDATE … WHERE recycler_id IS NULL OR = ?` and the `lat, lng, lat` bind order.
- **Rewards + email are best-effort** — a ledger/tunnel/SMTP outage must never block or roll back the request path.
- **Secrets are gitignored** (`.env`, `key.pem`); use the `.env.example` files. The rewards ledger URL is an ephemeral tunnel — update `REWARDS_LEDGER_URL` when it rotates.
- **Coverage gates backend CI** (`jest.config.js` thresholds over scoped pure units) — adding code to a covered file without tests can fail CI.
- **Expo Go constraints** — animations use Reanimated/SVG/linear-gradient only; the `EXPO_PUBLIC_API_URL` LAN-IP must match the dev machine on a physical phone.
```
