# Connect2Recycle (CTR)

A role-based e-waste recycling platform. Users book **pickups** or **drop-offs**, recyclers run **stores**, and admins oversee the marketplace — with a mutual-OTP handover, reward points, collection drives, impact reports, an admin content CMS, and a rule-based assistant.

Two independent apps in one repo:

| Directory | Stack | Runs on |
|---|---|---|
| `backend/` | Node/Express REST API, MySQL (`mysql2/promise`) | Port **4000** |
| `frontend/` | Expo SDK 54 / React Native (Expo Router, React 19, TypeScript, NativeWind v4) | Expo Go or a native build |

> There is **no root tooling** — `backend/` and `frontend/` are separate npm projects. Run every command from inside the relevant directory.

Deeper reference: [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Prerequisites

- **Node.js** 18+ and npm
- **MySQL** 8+ running locally (or a hosted instance)
- **Expo Go** on your phone (iOS/Android), or an emulator/simulator
- Your dev machine and phone on the **same Wi-Fi/LAN** (for Expo Go on a physical device)

---

## 1. Backend (`backend/`)

### Setup

```bash
cd backend
npm install
cp .env.example .env          # then edit .env with real values
```

Create the database (tables are auto-created/patched on boot, so you only need an empty schema):

```sql
CREATE DATABASE recycling_platform;
```

Minimum `.env` to boot (see `.env.example` for the full list, including email + rewards):

```bash
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=recycling_platform
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

> **Email is optional.** Without `EMAIL_*` set, OTP/notification emails are skipped (best-effort, fire-and-forget) and the app still runs. To exercise registration OTP end-to-end, fill in the `EMAIL_*` block.

### Run

```bash
npm run dev        # nodemon (auto-reload) — recommended for development
# or
npm start          # node server.js
```

On first boot you should see `✅ Tables ensured` and `🚀 Server running on port 4000`. All tables (including stores, pickups, drop-offs, drives, reports, CMS, etc.) are created/migrated automatically by `createTables()` in `server.js` — **no migration tool required**.

### Tests

```bash
npm test               # unit tests — no DB needed (mocked env)
npm run test:coverage  # coverage gate (thresholds in jest.config.js)
npm run test:integration   # needs a live, disposable MySQL (point DB_* at it)
```

---

## 2. Frontend (`frontend/`)

### Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to reach your backend:

- **Physical phone (Expo Go):** your dev machine's **current LAN IP**, e.g. `http://192.168.1.100:4000/api`.
  `npm start` auto-syncs this via `scripts/start.mjs` (and clears the Metro cache when the IP changes) — so you can usually just run it.
- **Android emulator:** `http://10.0.2.2:4000/api`
- **iOS simulator:** `http://localhost:4000/api`

### Run

```bash
npm start          # expo start (auto-syncs LAN IP into .env)
npm run android    # open on Android
npm run ios        # open on iOS
npm run start:raw  # plain `expo start` (no IP auto-sync)
```

Then scan the QR code with **Expo Go**, or press `a`/`i` for an emulator/simulator.

> Runs in **Expo Go SDK 54**, so only Expo-Go-safe native modules are used (reanimated, svg, linear-gradient, webview). Maps are Leaflet/OSM inside a WebView — no API key needed.

### Checks (the real gates — there is no `next build`)

```bash
npm run typecheck                       # tsc --noEmit
npx expo export --platform android      # bundle check (or --platform ios)
npm run lint
```

---

## Quick start (TL;DR)

```bash
# Terminal 1 — backend
cd backend && npm install && cp .env.example .env   # edit .env
# create the `recycling_platform` MySQL database, then:
npm run dev

# Terminal 2 — frontend
cd frontend && npm install && cp .env.example .env  # set EXPO_PUBLIC_API_URL
npm start                                            # scan QR in Expo Go
```

---

## Roles & test flow

Three roles live in a MySQL enum: **`user`**, **`recycler`**, **`admin`**. Register from the app (email-OTP gated). A typical demo loop:

1. Register a **user** and a **recycler** (each verifies via the emailed OTP).
2. As the recycler, create a **store** (set accepted waste types + location).
3. As the user, schedule a **pickup** or request a **drop-off**.
4. The recycler accepts; both parties complete the handover with the **mutual OTP**.

Admin accounts are seeded/managed server-side (see `ADMIN_PASS` in `.env.example` and `ARCHITECTURE.md`).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App can't reach the backend / spinners hang | `EXPO_PUBLIC_API_URL` must be your machine's **current** LAN IP on a physical phone. Re-run `npm start` (it re-syncs) and confirm the backend is up. |
| `ECONNREFUSED` / DB errors on backend boot | MySQL isn't running or `DB_*` creds/`DB_NAME` are wrong. Create the database and check `.env`. |
| No OTP email arrives | `EMAIL_*` isn't configured — email is optional and skipped when unset. Set the SMTP block to test OTP delivery. |
| Type or bundling errors after changes | Run `npm run typecheck` and `npx expo export` in `frontend/`. |
| Managed/hosted MySQL rejects the connection | Set `DB_SSL=true` in the backend `.env`. |

---

## Security notes

- **Never commit `.env`, `*.pem`, or `*.key`** — they're gitignored. Only `.env.example` templates are tracked.
- OTP codes are emailed and shown to their owner only; they're never serialised into other API responses.
