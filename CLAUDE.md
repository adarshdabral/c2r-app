# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

Two-app monorepo with no root tooling — `backend/` and `frontend/` are independent npm projects. Run commands from inside whichever directory you're working in. CI/CD lives in `.github/workflows/ci-cd.yml`; reference docs are `ARCHITECTURE.md` and `DEPLOYMENT.md` at the repo root.

- `backend/` — Node/Express REST API on port 4000, MySQL via `mysql2/promise`.
- `frontend/` — Expo SDK 54 / React Native app (Expo Router + React 19 + TypeScript + NativeWind v4), run via Expo Go or a native build. (Migrated in place from the original Next.js web app.)

## Common commands

### Backend (`backend/`)

```bash
npm run dev               # nodemon server.js
npm start                 # node server.js
npm test                  # jest — unit tests (no DB needed)
npm run test:coverage     # jest --coverage (CI gate; thresholds in jest.config.js)
npm run test:integration  # jest --config jest.integration.config.js --runInBand (needs live MySQL)
npm run migrate:stores    # node scripts/migrateRecyclersToStores.js
```

Requires a running MySQL and a `backend/.env` with `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`. Email features additionally need `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`. Optional: `CORS_ORIGIN`, `LOG_LEVEL`, `PICKUP_SWEEP_INTERVAL_MS`, `NODE_ENV`. Tables are auto-created/patched on boot via `createTables()` in `server.js` — no migration tool.

**Tests.** Unit tests (`__tests__/*.test.js`) run with mocked env and no DB. Integration tests (`__tests__/integration/`) spin up the real Express app via supertest against a real MySQL (`globalSetup`/`globalTeardown` manage the schema); point `DB_*` at a disposable database. Run one file: `npx jest __tests__/bookingController.test.js`. Coverage is intentionally scoped to pure units (see `collectCoverageFrom` in `jest.config.js`) so the DB-heavy controllers/models don't dilute thresholds.

### Frontend (`frontend/`) — Expo / React Native (migrated from Next.js)

```bash
npm start                 # node scripts/start.mjs → expo start (auto-syncs LAN IP into .env)
npm run start:raw         # plain expo start
npm run android           # expo start --android
npm run ios               # expo start --ios
npm run typecheck         # tsc --noEmit  (the real type gate)
npm run lint              # expo lint
```

`EXPO_PUBLIC_API_URL` must point at the backend; on a **physical phone** (Expo Go) it must be the dev machine's **current LAN IP** — `npm start` rewrites it via `scripts/start.mjs` (and clears the Metro cache when it changes). There is no `next build`; the gates are **`npx tsc --noEmit`** and **`npx expo export --platform ios|android`** (bundle check). Runs in **Expo Go SDK 54**, so only Expo-Go-safe native modules are allowed (reanimated/svg/linear-gradient/webview — **no Skia/Lottie**).

### CI/CD

There is currently **no committed `.github/workflows`** — run the gates locally: frontend `npx tsc --noEmit` + `npx expo export --platform ios|android`; backend `npm run test:coverage` (+ `npm run test:integration` against a disposable MySQL). The **backend deploys to Render** via `render.yaml` (`scripts/deploy.sh` + EC2 are the older path). The auth rate limiter is skipped when `NODE_ENV` is `development` or `test` so tests aren't throttled.

## Architecture

### Backend — role-based e-waste recycling platform

Three user roles in a MySQL enum: `user`, `recycler`, `admin`. Within `role='user'`, a `user_type` segments accounts (`individual` / `small_business` / `bulk_producer`, see `config/userTypes.js` — keep in sync with `frontend/lib/userTypes.ts`). The domain has grown well beyond the original booking flow; there are **four** request-like flows, each its own routes→controller→model triad:

**Stores** (`storeModel.js`, `/api/stores`) are the core entity. A recycler owns many stores; each is a physical drop-off/pickup point with its own coordinates, `accepted_waste_types` (a MySQL `SET` of e-waste categories), capacity (`daily_capacity_kg` / `current_capacity_kg` / admin-set `daily_threshold_kg`), `status` (Active/Inactive) and `verification_status` (Pending/Verified/Rejected). This replaced location columns that used to live on the `users` row — `scripts/migrateRecyclersToStores.js` backfills a default store per legacy recycler (idempotent).

**Pickup requests** (`pickupRequestModel.js`, `/api/pickup-requests`) are a broadcast/auction: a user raises a request, the platform broadcasts it to the top-N nearest *Active + Verified* stores (`pickup_request_candidates` records the fan-out per round), and the first recycler to accept wins. Status machine: `REQUESTED → BROADCASTED → ACCEPTED → EN_ROUTE → ARRIVED → OTP_PENDING → COMPLETED` (plus `CANCELLED`/`EXPIRED`). A background sweeper (`runPickupSweep`, started in `server.js` on a `PICKUP_SWEEP_INTERVAL_MS` timer, default 30s) re-broadcasts requests past their `acceptance_deadline` to the next-nearest stores or expires them.

**Drop-off requests** (`dropOffRequestModel.js`, `/api/dropoff-requests`) have no broadcast — the user picks a specific store + time slot, and that store's recycler approves. Status: `REQUESTED → APPROVED → CHECKED_IN → OTP_PENDING → COMPLETED` (plus `CANCELLED`). `recycler_id` is denormalised from the store owner.

**Bookings** (`bookingModel.js`, `/api/bookings`) are the original/legacy flow, still present. A user creates a booking targeting a `store_id`; a recycler claims one via `assignRecycler()`, an atomic `UPDATE ... WHERE recycler_id IS NULL OR recycler_id = ?` that prevents races. Transitions are constrained by `nextStatusMap` in `controllers/bookingController.js`: `pending → accepted → completed`; anything else returns 400. Completing a booking calls `releaseCapacity()` on its store.

Both pickup and drop-off completion are gated by a **mutual OTP handshake**: each side gets a code (`otp_user`/`otp_recycler`), with `otp_expiry`, an `otp_attempts` counter, and per-side `*_otp_verified` flags. Every attempt is appended to `otp_verification_log` (polymorphic over `request_type` pickup/dropoff — no FK). **Disputes** (`disputeModel.js`, `/api/disputes`) let either party raise an issue against a pickup/dropoff request (also polymorphic) for admins to resolve. **Reviews** (`reviewModel.js`) — one per (store, user), enforced by a UNIQUE index; `stores.rating`/`total_reviews` are recomputed on every write. **Stations** (`stationModel.js`) are a separate admin-managed entity that predates stores and is largely legacy.

**E-waste taxonomy, images, certificates, quantity** (added on top of the pickup/drop-off flows):
- **CPCB taxonomy** (`ewasteModel.js` → `ewaste_categories` + `ewaste_items`, `GET /api/ewaste/categories`) is **data-driven** — seeded once in `server.js` (`seedEwasteTaxonomy`, only when empty) and extended by data, never code. A booking's selected category→appliance pairs live in `request_items` (polymorphic over pickup/dropoff, no FK), stored on create and returned (grouped by category) via `attachItemsToMany`. This is **additive** to the 9-type `waste_category` list, which still drives store matching.
- **Images** (`requestImageModel.js`, `/api/images/:type/:id`) are stored as **base64 in MySQL** (`request_images`, so they survive Render's ephemeral FS) — no multer. `uploaded_by` separates the user's from the recycler's set; both parties + admin can view both. The Express JSON body limit is raised to **25 MB** for these uploads.
- **Data Sanitization Certificates** (`certificateModel.js` + `services/certificateService.js`, `/api/certificates/:type/:id`) — the **recycler is the issuing authority**. `sanitization_requested` (a boolean on both request tables) is set at booking; the recycler submits a form → a professional PDF (pdfkit + a `qrcode` verification QR) is generated and stored base64 in `certificates`. `GET .../download` streams the PDF; `GET /verify/:id` is public. `pdfkit`/`qrcode` need no env.
- **Quantity is informational, never a gate.** `waste_quantity` = user-declared, `actual_quantity_kg` = recycler-verified; completion never compares them. The UI shows both + a "mismatch" badge only.

**Geo queries** (`getNearestStores` in `storeModel.js`, `getNearestStations` in `stationModel.js`) compute Haversine distance in SQL with `ACOS/COS/SIN(RADIANS(...))` and Earth radius 6371 km. The binding order is `lat`, `lng`, `lat` (lat bound twice, lng once) — preserve it when modifying. `getNearestStores` filters to `status='Active' AND verification_status='Verified'`.

**Auth** (`middleware/authMiddleware.js`, `controllers/authController.js`):
- Registration is OTP-gated: register → email OTP → `verifyOTP` (sets `is_verified`); `resendOTP` reissues. Login refuses unverified (`is_verified`) or `is_suspended` accounts.
- `protect` reads the JWT from the `Authorization: Bearer …` header or a `token=` cookie, verifies with `JWT_SECRET`, sets `req.user = { id, role }`. Login sets the token as an httpOnly cookie *and* returns it in the JSON body; the RN client stores it in `expo-secure-store` and sends it as a Bearer header (the cookie transport is unused on mobile).
- `requireRole(...roles)` is composed after `protect` for role gating (used in most route files: bookings, admin, stations, stores, pickup, dropoff, disputes).

**Cross-cutting utilities** (`utils/`):
- `ApiError` — operational errors with `statusCode` + static helpers (`badRequest`, `notFound`, …). Thrown from controllers/models; the central error handler in `server.js` translates them to JSON (≥500 messages are masked to "Internal server error").
- `asyncHandler` — wraps async handlers so rejections reach the error middleware; use it instead of per-handler try/catch.
- `query.js` — `parsePagination`/`parseSort`/`parseSearch`/`buildMeta`/`setPaginationHeaders` for list endpoints. Sort keys are whitelisted against a trusted-column map (ORDER BY can't be parameterized); LIMIT/OFFSET stay bound. List endpoints surface pagination via `X-Total-Count`/`X-Page`/… headers for backward compatibility.
- `logger.js` — dependency-free structured JSON logger gated by `LOG_LEVEL`; `middleware/requestLogger.js` logs each request.
- `sendEmail.js` / `emailTemplates.js` / `config/email.js` — nodemailer transport for OTP, verification, password reset, and pickup/drop-off notifications. Notification sends are **best-effort / fire-and-forget** — a mail outage must never block the request path.

**MVC convention** is strict: routes → controllers → models → `config/db.js` pool. Don't call `db` directly from controllers; add a model function (the admin overview in `controllers/adminController.js` is the deliberate exception — keep that pattern for new admin aggregations).

`server.js` only boots the server/DB/sweeper when run directly (`require.main === module`); it exports `{ app, createTables }` with no side effects so supertest can import it.

### Frontend — Expo Router (RN) with role-routed screens

Role separation uses `(user)` as an **invisible route group** (bare URLs like `/dashboard`, `/stores`) while `recycler` and `admin` are **real path segments** — to avoid Expo Router URL collisions. Layout: `app/_layout.tsx` (font load, providers, auth+role guard), `app/(auth)/` (login/register/reset), `app/(user)/` `(tabs)` (dashboard, stores, pickups, dropoff, profile) + pushed screens (pickup/new, dropoff/mine, stores/[id], rewards, notifications), `app/recycler/`, `app/admin/`.

**Auth gating (no web middleware):**
- `app/_layout.tsx` (`useProtectedRoute`) redirects unauthenticated users out of protected groups to `/login`, and authenticated users to their role home (`homeRouteFor` in `src/context/AuthContext.tsx`). Role-mismatch is enforced client-side.
- `src/lib/api.ts` axios instance attaches `Authorization: Bearer <token>` from an in-memory cache (hydrated at boot) and, on a live-session `401`, clears the session and routes to `/login` (15s timeout). Token → `expo-secure-store`; role/user_type → AsyncStorage.

`src/lib/api.ts` is the typed API surface (stores, pickups, drop-offs, reviews, disputes, rewards, ewaste/images/certificates, admin). `src/lib/geocode.ts` (OSM Nominatim) backs address reverse/forward geocoding.

**UI stack:** hand-built primitives in `src/components/ui/` (Surface/Text/Button/Field/Switch/…), **NativeWind v4** (CSS-variable theme in `global.css` + `tailwind.config.js`), `lucide-react-native` icons, path alias `@/*` → frontend root. Signature type is **Fraunces** (`font-display`); motion primitives in `src/components/motion/` (PressableScale, CountUp, ProgressRing, Floaty/Pulse, Shimmer); coded-color flows in `src/lib/domains.ts` (`GradientHeader`). **Maps** are Leaflet/OSM inside `react-native-webview` (`src/components/map/LeafletMap.tsx`; Leaflet inlined in `leaflet-inline.ts`) — no API key, works on Android + iOS in Expo Go (react-native-maps was blank on Android; do not reintroduce it). Booking extras (category→appliance picker, image uploader, `BookingDetails`) live in `src/components/booking/`.

## Things to watch

- **Schema lives in `server.js`'s `createTables()`** — no migration tool. `CREATE TABLE IF NOT EXISTS` only affects fresh DBs; for existing DBs the file uses an idempotent `ensureColumn()` helper for additive `ALTER TABLE`s. There are also one-off scripts: `scripts/migrate-waste-categories.sql` and `scripts/migrateRecyclersToStores.js`. Plan a manual migration for any column change against a running DB.
- **No `next build`** (the frontend is Expo/RN). Types aren't checked at bundle time, so run `npx tsc --noEmit` in `frontend/` when changing types, and `npx expo export` to catch bundling/runtime-import errors. `EXPO_PUBLIC_API_URL` must match the dev machine's LAN IP on a physical phone.
- **`backend/.env` is committed** with a real `JWT_SECRET` and DB password (`.gitignore` only excludes `node_modules`). Don't add new secrets without first moving the file out of git.
- **`Booking` type / `station_id`** — the schema still has a nullable `station_id` FK on `bookings`, but the create path uses `store_id` (see the "FIX" comment in `controllers/bookingController.js`). Stations are largely legacy; new work targets stores.
- **OTPs are never serialised to clients** — they're emailed (except the owner's own handover code on their `/mine` view). Don't add OTP fields to other response shapes.
- **Uploaded images + certificate PDFs are stored as base64 in MySQL** (`request_images.data`, `certificates.pdf_data`) — chosen so they survive Render's ephemeral filesystem. This bloats the DB; clients compress images (≤3MB) and the JSON body limit is 25MB. If reintroducing filesystem/cloud storage, a migration is needed. Watch for **leftover tables from prior attempts** in a shared dev DB — `CREATE TABLE IF NOT EXISTS` silently skips a table that already exists with a different schema (this bit us: a filesystem-based `request_images`/`certificates` and a `waste_items` FK-name collision).
- **Coverage thresholds gate CI** (`jest.config.js`: 85% statements/lines, 80% branches, 90% functions over the scoped units). Adding code to a covered file without tests can fail the backend CI job.
