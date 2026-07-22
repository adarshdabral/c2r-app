# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

Two-app monorepo with no root tooling — `backend/` and `frontend/` are independent npm projects. Run commands from inside whichever directory you're working in. CI/CD lives in `.github/workflows/ci-cd.yml`; reference docs are `ARCHITECTURE.md` and `DEPLOYMENT.md` at the repo root.

- `backend/` — Node/Express REST API on port 4000, MySQL via `mysql2/promise`.
- `frontend/` — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui, served on port 3000.

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

### Frontend (`frontend/`)

```bash
npm run dev               # next dev (http://localhost:3000)
npm run build             # next build
npm start                 # next start
npm run lint              # eslint .
npm test                  # vitest run
npm run test:watch        # vitest
npm run test:coverage     # vitest run --coverage
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000/api` (see `lib/api.ts`). `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `next build` (the CI gate) and `npx tsc --noEmit` are the ways to catch type errors before runtime. Vitest uses jsdom + Testing Library (config in `vitest.config.mts`, `@` alias → frontend root). Run one file: `npx vitest run __tests__/geocode.test.ts`.

### CI/CD

`.github/workflows/ci-cd.yml` runs on push/PR to `main`: **frontend** (vitest + `next build`), **backend** (`node --check` syntax sweep + `npm run test:coverage`), and **backend-integration** (supertest against a `mysql:8.4` service). On push to `main`, after all three pass, **deploy** SSHes to EC2 and runs `scripts/deploy.sh`. The auth rate limiter is skipped when `NODE_ENV` is `development` or `test` so tests aren't throttled.

## Architecture

### Backend — role-based e-waste recycling platform

Three user roles in a MySQL enum: `user`, `recycler`, `admin`. Within `role='user'`, a `user_type` segments accounts (`individual` / `small_business` / `bulk_producer`, see `config/userTypes.js` — keep in sync with `frontend/lib/userTypes.ts`). The domain has grown well beyond the original booking flow; there are **four** request-like flows, each its own routes→controller→model triad:

**Stores** (`storeModel.js`, `/api/stores`) are the core entity. A recycler owns many stores; each is a physical drop-off/pickup point with its own coordinates, `accepted_waste_types` (a MySQL `SET` of e-waste categories), capacity (`daily_capacity_kg` / `current_capacity_kg` / admin-set `daily_threshold_kg`), `status` (Active/Inactive) and `verification_status` (Pending/Verified/Rejected). This replaced location columns that used to live on the `users` row — `scripts/migrateRecyclersToStores.js` backfills a default store per legacy recycler (idempotent).

**Pickup requests** (`pickupRequestModel.js`, `/api/pickup-requests`) are a broadcast/auction: a user raises a request, the platform broadcasts it to the top-N nearest *Active + Verified* stores (`pickup_request_candidates` records the fan-out per round), and the first recycler to accept wins. Status machine: `REQUESTED → BROADCASTED → ACCEPTED → EN_ROUTE → ARRIVED → OTP_PENDING → COMPLETED` (plus `CANCELLED`/`EXPIRED`). A background sweeper (`runPickupSweep`, started in `server.js` on a `PICKUP_SWEEP_INTERVAL_MS` timer, default 30s) re-broadcasts requests past their `acceptance_deadline` to the next-nearest stores or expires them.

**Drop-off requests** (`dropOffRequestModel.js`, `/api/dropoff-requests`) have no broadcast — the user picks a specific store + time slot, and that store's recycler approves. Status: `REQUESTED → APPROVED → CHECKED_IN → OTP_PENDING → COMPLETED` (plus `CANCELLED`). `recycler_id` is denormalised from the store owner.

**Bookings** (`bookingModel.js`, `/api/bookings`) are the original/legacy flow, still present. A user creates a booking targeting a `store_id`; a recycler claims one via `assignRecycler()`, an atomic `UPDATE ... WHERE recycler_id IS NULL OR recycler_id = ?` that prevents races. Transitions are constrained by `nextStatusMap` in `controllers/bookingController.js`: `pending → accepted → completed`; anything else returns 400. Completing a booking calls `releaseCapacity()` on its store.

Both pickup and drop-off completion are gated by a **mutual OTP handshake**: each side gets a code (`otp_user`/`otp_recycler`), with `otp_expiry`, an `otp_attempts` counter, and per-side `*_otp_verified` flags. Every attempt is appended to `otp_verification_log` (polymorphic over `request_type` pickup/dropoff — no FK). **Disputes** (`disputeModel.js`, `/api/disputes`) let either party raise an issue against a pickup/dropoff request (also polymorphic) for admins to resolve. **Reviews** (`reviewModel.js`) — one per (store, user), enforced by a UNIQUE index; `stores.rating`/`total_reviews` are recomputed on every write. **Stations** (`stationModel.js`) are a separate admin-managed entity that predates stores and is largely legacy.

**Geo queries** (`getNearestStores` in `storeModel.js`, `getNearestStations` in `stationModel.js`) compute Haversine distance in SQL with `ACOS/COS/SIN(RADIANS(...))` and Earth radius 6371 km. The binding order is `lat`, `lng`, `lat` (lat bound twice, lng once) — preserve it when modifying. `getNearestStores` filters to `status='Active' AND verification_status='Verified'`.

**Auth** (`middleware/authMiddleware.js`, `controllers/authController.js`):
- Registration is OTP-gated: register → email OTP → `verifyOTP` (sets `is_verified`); `resendOTP` reissues. Login refuses unverified (`is_verified`) or `is_suspended` accounts.
- `protect` reads the JWT from the `Authorization: Bearer …` header or a `token=` cookie, verifies with `JWT_SECRET`, sets `req.user = { id, role }`. Login sets the token as an httpOnly cookie *and* returns it in the JSON body for `localStorage`.
- `requireRole(...roles)` is composed after `protect` for role gating (used in most route files: bookings, admin, stations, stores, pickup, dropoff, disputes).

**Cross-cutting utilities** (`utils/`):
- `ApiError` — operational errors with `statusCode` + static helpers (`badRequest`, `notFound`, …). Thrown from controllers/models; the central error handler in `server.js` translates them to JSON (≥500 messages are masked to "Internal server error").
- `asyncHandler` — wraps async handlers so rejections reach the error middleware; use it instead of per-handler try/catch.
- `query.js` — `parsePagination`/`parseSort`/`parseSearch`/`buildMeta`/`setPaginationHeaders` for list endpoints. Sort keys are whitelisted against a trusted-column map (ORDER BY can't be parameterized); LIMIT/OFFSET stay bound. List endpoints surface pagination via `X-Total-Count`/`X-Page`/… headers for backward compatibility.
- `logger.js` — dependency-free structured JSON logger gated by `LOG_LEVEL`; `middleware/requestLogger.js` logs each request.
- `sendEmail.js` / `emailTemplates.js` / `config/email.js` — nodemailer transport for OTP, verification, password reset, and pickup/drop-off notifications. Notification sends are **best-effort / fire-and-forget** — a mail outage must never block the request path.

**MVC convention** is strict: routes → controllers → models → `config/db.js` pool. Don't call `db` directly from controllers; add a model function (the admin overview in `controllers/adminController.js` is the deliberate exception — keep that pattern for new admin aggregations).

`server.js` only boots the server/DB/sweeper when run directly (`require.main === module`); it exports `{ app, createTables }` with no side effects so supertest can import it.

### Frontend — Next.js App Router with role-routed pages

Route segments map to roles/flows: `app/dashboard` (user), `app/recycler`, `app/admin`, plus `app/booking`, `app/pickup`, `app/dropoff`, `app/stores`, `app/profile`, `app/login`, `app/register`.

**Auth gating happens in two places:**
- `middleware.ts` redirects unauthenticated requests for `/dashboard`, `/recycler`, `/admin`, `/booking`, `/dropoff`, `/pickup`, `/profile` to `/login` based on the `token` cookie. **Keep the `protectedPaths` array and the `config.matcher` in sync** when adding routes.
- `lib/api.ts` axios instance attaches `Authorization: Bearer <localStorage.token>` on every request and globally redirects to `/login` on 401. The backend also accepts the cookie, so both transports work — keep them in sync if you change one.

After login (`app/login/page.tsx`), the client stores `token` and `role` in `localStorage` and routes by role (`admin → /admin`, `recycler → /recycler`, else `/dashboard`). Server middleware only knows the cookie, not the role, so role-mismatch enforcement is client-side.

`lib/api.ts` is the typed API surface — request/response types for stores, pickups, drop-offs, reviews, disputes, admin stats, etc. live there. `lib/geocode.ts` (OSM Nominatim) and `lib/india-locations.ts` back the cascading State/District/City/Locality picker.

**UI stack:** shadcn/ui components in `components/ui/` (`components.json`, style `new-york`, base color `neutral`, icons `lucide-react`). Path alias `@/*` → frontend root. Tailwind v4 (`@tailwindcss/postcss`) is CSS-variable based in `app/globals.css`, not a `tailwind.config.*`. Maps use `leaflet` + `react-leaflet` (e.g. `components/station-map.tsx`) and must be client components.

## Things to watch

- **Schema lives in `server.js`'s `createTables()`** — no migration tool. `CREATE TABLE IF NOT EXISTS` only affects fresh DBs; for existing DBs the file uses an idempotent `ensureColumn()` helper for additive `ALTER TABLE`s. There are also one-off scripts: `scripts/migrate-waste-categories.sql` and `scripts/migrateRecyclersToStores.js`. Plan a manual migration for any column change against a running DB.
- **`typescript.ignoreBuildErrors: true`** in `next.config.mjs` means `next build` won't fail on TS errors — run `npx tsc --noEmit` in `frontend/` when changing types.
- **`backend/.env` is committed** with a real `JWT_SECRET` and DB password (`.gitignore` only excludes `node_modules`). Don't add new secrets without first moving the file out of git.
- **`Booking` type / `station_id`** — the schema still has a nullable `station_id` FK on `bookings`, but the create path uses `store_id` (see the "FIX" comment in `controllers/bookingController.js`). Stations are largely legacy; new work targets stores.
- **OTPs are never serialised to clients** — they're emailed. Don't add OTP fields to API response shapes.
- **Coverage thresholds gate CI** (`jest.config.js`: 85% statements/lines, 80% branches, 90% functions over the scoped units). Adding code to a covered file without tests can fail the backend CI job.
