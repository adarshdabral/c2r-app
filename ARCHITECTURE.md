# Architecture

Connect2Recycle is a two-tier waste-pickup platform that connects waste generators (**users**) with **recyclers**, supervised by an **admin** role. It is a monorepo with two independent npm projects, `backend/` (Express + MySQL REST API) and `frontend/` (Next.js 16 App Router). There is no root tooling — each app is run from its own directory.

```
+--------------------+        HTTPS / JSON         +-----------------------+        TCP        +---------+
|  Next.js frontend  | <-------------------------> |  Express REST API     | <---------------> |  MySQL  |
|  (port 3000)       |   Authorization: Bearer …   |  (port 4000, /api/*)  |   mysql2 pool     |         |
|  React 19 + TS     |   Cookie: token=…           |  JWT auth, MVC        |   (limit 10)      |         |
+--------------------+                             +-----------------------+                   +---------+
        |                                                    |
        | leaflet (OpenStreetMap tiles)                      | bcryptjs / jsonwebtoken
        v                                                    v
   Map UI client-side                                Auto-created schema on boot
```

---

## 1. Backend — `backend/`

Node + Express REST API. Entry point: `backend/server.js`. Mounts five routers under `/api/*`, applies CORS (origin `CORS_ORIGIN` || `http://localhost:3000`, credentials enabled), JSON body parsing, a single rate limiter on auth, and a catch-all error handler. The server boots by calling `createTables()` (idempotent `CREATE TABLE IF NOT EXISTS`) and then `app.listen(PORT)`.

### 1.1 Layering (strict MVC)

```
routes/  →  controllers/  →  models/  →  config/db.js (mysql2 pool)
```

- `routes/*Routes.js` — Express routers; the only place `protect` and `requireRole(...)` middleware is composed.
- `controllers/*Controller.js` — request validation, role checks, status-transition logic, response shaping.
- `models/*Model.js` — every SQL query. Controllers do not import `db` directly.
- `config/db.js` — single `mysql2/promise` pool (`connectionLimit: 10`).

**One documented exception:** `controllers/adminController.js` imports `db` directly to compose multiple aggregate queries (counts + user list + booking list) in a single handler. Follow that same pattern when adding new admin overview aggregations; everything else must go through a model function.

### 1.2 Modules

| Router file              | Controller                | Model                | Mount         |
| ------------------------ | ------------------------- | -------------------- | ------------- |
| `routes/authRoutes.js`   | `authController.js`       | `userModel.js`       | `/api/auth`   |
| `routes/bookingRoutes.js`| `bookingController.js`    | `bookingModel.js`    | `/api/bookings` |
| `routes/stationRoutes.js`| `stationController.js`    | `stationModel.js`    | `/api/stations` |
| `routes/recyclerRoutes.js`| `recyclerController.js`  | `userModel.js`       | `/api/recyclers` |
| `routes/adminRoutes.js`  | `adminController.js`      | (direct `db` query)  | `/api/admin`  |

Cross-cutting:

- `middleware/authMiddleware.js` — `protect`, `requireRole(...roles)`.
- `utils/generateToken.js` — wraps `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN || '7d' })`.

### 1.3 Database schema

Defined inline in `server.js`'s `createTables()`. **No migration tool** — schema changes apply only to fresh databases. Existing tables must be altered manually.

```sql
users (
  id           INT PK AUTO_INCREMENT,
  name         VARCHAR(100),
  email        VARCHAR(150) UNIQUE,
  password     VARCHAR(255),      -- bcrypt hash, cost 10
  role         ENUM('user','recycler','admin') DEFAULT 'user',
  latitude     DECIMAL(10,7) NULL,  -- required for recyclers (validated in controller)
  longitude    DECIMAL(10,7) NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

stations (
  id           INT PK AUTO_INCREMENT,
  name         VARCHAR(150),
  latitude     DECIMAL(10,7),
  longitude    DECIMAL(10,7),
  address      VARCHAR(255),
  capacity     INT DEFAULT 0
)

bookings (
  id           INT PK AUTO_INCREMENT,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id   INT NULL     REFERENCES stations(id) ON DELETE SET NULL,  -- legacy, ignored by create path
  recycler_id  INT NULL     REFERENCES users(id) ON DELETE SET NULL,
  status       ENUM('pending','accepted','completed') DEFAULT 'pending',
  pickup_date  DATETIME,
  latitude     DECIMAL(10,7),
  longitude    DECIMAL(10,7),
  address      VARCHAR(255),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Note: `bookings.station_id` is still in the schema as a nullable FK, but the create path in `controllers/bookingController.js` ignores it (see the "FIX: removed stationId" comment there). The `Booking` type in `frontend/lib/api.ts` still references `station_id`/`station_name` and is out of sync with the backend.

### 1.4 Auth model

- **Registration** (`POST /api/auth/register`) — normalizes email, requires password ≥ 6 chars, bcrypt-hashes (cost 10). Role is either `user` (default) or `recycler`; `admin` cannot self-register. Recyclers must include valid `latitude`/`longitude`.
- **Login** (`POST /api/auth/login`) — returns the JWT in the JSON body **and** sets it as an `httpOnly`, `sameSite=strict`, `maxAge=7d` cookie named `token`. (`secure` only when `NODE_ENV=production`.)
- **`protect`** — accepts the JWT from either `Authorization: Bearer …` or a `token=` cookie; verifies with `JWT_SECRET`; sets `req.user = { id, role }`.
- **`requireRole(...roles)`** — composed after `protect` on role-gated routes.
- **Rate limit** — `express-rate-limit`, 20 req / 15 min, applied only to `/api/auth/*`. All other routes are unthrottled.

### 1.5 Booking state machine

Status transitions are constrained by `nextStatusMap` in `controllers/bookingController.js`:

```
pending  --(recycler claims & accepts)-->  accepted
accepted ---------(recycler completes)-->  completed
```

Any other transition returns 400. Admins can also drive transitions (same endpoint, same `nextStatusMap`).

**Race-safe claim** — `models/bookingModel.js#assignRecycler` runs:

```sql
UPDATE bookings
   SET recycler_id = ?
 WHERE id = ?
   AND (recycler_id IS NULL OR recycler_id = ?)
```

The `affectedRows = 0` case is what surfaces to the user as `403 Booking already assigned to another recycler` — this is the only thing preventing two recyclers from claiming the same booking concurrently. Preserve this pattern when refactoring.

### 1.6 Geo queries

`models/userModel.js#getNearestRecyclers` and `models/stationModel.js#getNearestStations` compute Haversine distance directly in SQL, using Earth radius **6371 km**:

```sql
(6371 * ACOS(
  COS(RADIANS(?)) * COS(RADIANS(latitude)) *
  COS(RADIANS(longitude) - RADIANS(?)) +
  SIN(RADIANS(?)) * SIN(RADIANS(latitude))
)) AS distance
```

The bind ordering is **`lat, lng, lat, limit`** — `lat` appears twice, `lng` once. Preserve that order when modifying. Results are sorted `ORDER BY distance ASC` and capped by `LIMIT ?`.

### 1.7 REST surface

| Method | Path                        | Auth                | Notes                                          |
| ------ | --------------------------- | ------------------- | ---------------------------------------------- |
| GET    | `/api/health`               | public              | Liveness probe                                 |
| POST   | `/api/auth/register`        | public (rate-lim.)  | Self-serve user or recycler                    |
| POST   | `/api/auth/login`           | public (rate-lim.)  | Sets cookie + returns token                    |
| POST   | `/api/auth/logout`          | public (rate-lim.)  | Clears cookie                                  |
| GET    | `/api/auth/profile`         | any role            | Returns `{ name, email, role }`                |
| PUT    | `/api/auth/profile`         | any role            | Updates name + email                           |
| POST   | `/api/bookings`             | any role            | Create with `recycler_id` + pickup coords      |
| GET    | `/api/bookings`             | recycler, admin     | Recycler sees unclaimed OR own; admin sees all |
| GET    | `/api/bookings/recycler`    | recycler            | Bookings already claimed by caller             |
| GET    | `/api/bookings/user`        | any role            | Caller's own bookings (paginated)              |
| PATCH  | `/api/bookings/:id`         | recycler, admin     | Drives `nextStatusMap` transition              |
| GET    | `/api/stations`             | public              | All stations                                   |
| GET    | `/api/stations/nearest`     | public              | `?lat=&lng=`                                   |
| POST   | `/api/stations`             | admin               |                                                |
| DELETE | `/api/stations/:id`         | admin               |                                                |
| GET    | `/api/recyclers/nearest`    | public              | `?lat=&lng=&limit=`                            |
| GET    | `/api/admin/overview`       | admin               | Aggregated stats + users + bookings            |

### 1.8 Environment

`backend/.env` must define `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`. Optional: `CORS_ORIGIN`, `NODE_ENV`. The `.env` file is currently **committed to git** with a real `JWT_SECRET` and DB password; `.gitignore` only excludes `node_modules`. Treat any new secret as something to gitignore first.

---

## 2. Frontend — `frontend/`

Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (CSS-variable theme in `app/globals.css`, no JS config file), shadcn/ui (`new-york` style, `neutral` base), `lucide-react` icons, `axios`, `react-leaflet` for maps, `framer-motion`, `recharts`, `react-hook-form` + `zod`.

### 2.1 Route layout

Route segments map 1:1 to roles. Each route directory contains a single `page.tsx`:

```
app/
  layout.tsx          root layout (Inter font, Vercel Analytics in prod)
  page.tsx            marketing landing
  login/              public
  register/           public
  dashboard/          user role
  recycler/           recycler role
  admin/              admin role
  booking/            shared (create / view)
  profile/            shared
```

### 2.2 Auth gating — two layers, kept in sync

1. **Edge middleware** (`middleware.ts`) — runs on `/dashboard`, `/recycler`, `/admin`, `/booking`, `/profile`. Reads the `token` cookie; redirects to `/login` if missing. **It does not decode the JWT** and has no notion of role.
2. **Client axios instance** (`lib/api.ts`) — on every request, attaches `Authorization: Bearer <localStorage.token>`. On any `401` response, clears `role` from localStorage and hard-redirects to `/login`.

Because the backend accepts the JWT from either transport, the cookie covers SSR/middleware and the `Authorization` header covers client-side fetches. **Keep both in sync if you change auth.**

After login (`app/login/page.tsx`), the client stores `token` and `role` in `localStorage` and routes by role: `admin → /admin`, `recycler → /recycler`, else `/dashboard`. **Role-mismatch enforcement is client-side only**; middleware only checks for the presence of any token.

### 2.3 UI conventions

- shadcn/ui primitives live in `components/ui/` and are configured via `components.json`.
- Shared app components live in `components/` (e.g. `navbar.tsx`, `footer.tsx`, `station-map.tsx`, `ProfileMenu.tsx`, `stats-card.tsx`, `status-badge.tsx`, `theme-provider.tsx`).
- Path alias `@/*` resolves to the frontend root (`tsconfig.json`).
- Hooks in `hooks/` (`use-mobile.ts`, `use-toast.ts`).
- Map components use `leaflet` + `react-leaflet` and **must** be client components (`"use client"`).

### 2.4 Build & types

- `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `next build` does not catch TS errors. Run `npx tsc --noEmit` in `frontend/` to validate types.
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000/api` (see `lib/api.ts`).
- `lib/api.ts` exports shared `UserRole`, `BookingStatus`, `Station`, and `Booking` types. The `Booking` type is currently **out of sync** with the backend (still references `station_id`/`station_name`).

---

## 3. End-to-end flow: a pickup booking

1. **User** opens `/booking`. The page calls `GET /api/recyclers/nearest?lat=&lng=` to populate a list/map of recyclers.
2. User submits a booking with `{ recycler_id, latitude, longitude, address }` via `POST /api/bookings`. The backend stores the row with `status='pending'`, `recycler_id` pre-targeted, `pickup_date = new Date()`.
3. **Recycler** opens `/recycler`. `GET /api/bookings` returns rows where `recycler_id IS NULL OR recycler_id = <recycler_id>` — unclaimed plus already-mine.
4. Recycler claims by `PATCH /api/bookings/:id` with `{ status: 'accepted' }`. The controller invokes `assignRecycler()` (race-safe `UPDATE … WHERE recycler_id IS NULL OR recycler_id = ?`). If another recycler claimed first, `affectedRows=0` and the API returns 403. Otherwise the status transitions `pending → accepted`.
5. Once the pickup is done, recycler `PATCH /api/bookings/:id` with `{ status: 'completed' }`. `nextStatusMap` enforces the `accepted → completed` step.
6. **Admin** can view aggregated stats and any booking via `GET /api/admin/overview` and can also drive status transitions via `PATCH /api/bookings/:id`.

---

## 4. Cross-cutting things to watch

- **No tests anywhere.** Verify behavior manually against a running backend + frontend.
- **No CI, no lint scripts on the backend.** Frontend has `npm run lint` (eslint).
- **Schema drift risk.** `createTables()` only creates missing tables; column changes require manual `ALTER TABLE` against any existing DB.
- **`Booking` type mismatch.** Frontend types in `lib/api.ts` still declare `station_id` / `station_name`; the backend booking flow no longer populates either. Update the type when you touch booking UI.
- **Committed `.env`.** Don't add new secrets without first moving the file out of git.
- **Race-safe claim and bind ordering.** The `assignRecycler` `UPDATE` and the Haversine `lat,lng,lat,limit` bind order are load-bearing — preserve them across refactors.
