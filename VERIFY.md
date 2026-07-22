# VERIFY.md — Running & testing the mobile app

The React Native (Expo) app lives **in place** in `/App/frontend`. The backend is
unchanged (`/App/backend`, Express on port 4000). The original web source was
migrated in place; the temporary `web-reference/` scaffold has been removed now
that parity is reached (it remains available in version control / the original
copy outside `/App`).

Status: **all features migrated.** `npx tsc --noEmit` is clean and
`npx expo export` bundles the full graph.

---

## 1. Prerequisites
- Node ≥ 20 (tested on Node 24), npm ≥ 10.
- Running backend + MySQL (see repo-root `CLAUDE.md` / `DEPLOYMENT.md`).
- Expo Go on a physical device, or iOS Simulator (Xcode) / Android emulator (Android Studio).

## 2. Configure the API URL
`localhost` on a device/emulator points at the device, not your machine. Set `EXPO_PUBLIC_API_URL`:

| Target | Value |
|---|---|
| iOS Simulator | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` |
| Physical device | `http://<computer-LAN-IP>:4000/api` |

```bash
cd App/frontend
echo 'EXPO_PUBLIC_API_URL=http://<host>:4000/api' > .env   # or export it
```
Native apps ignore CORS, so no backend change is needed. Auth is Bearer-token only.

## 3. Run
```bash
cd App/frontend
npm install          # first time
npm start            # press i (iOS) / a (Android)
# or: npm run ios | npm run android
```

## 4. Static checks (gates)
```bash
cd App/frontend
npm run typecheck                                   # tsc --noEmit — clean
npx expo export --platform ios --output-dir /tmp/x  # bundles whole graph — clean
```

---

## 5. Navigation model
- Route groups drive role separation. Users get bare URLs (`/dashboard`, `/stores`, …);
  recyclers live under `/recycler/*`; admin under `/admin` (real segments → no URL
  collisions, and matching the web's URLs).
- Auth + role guard is centralized in `app/_layout.tsx` (`useProtectedRoute`) +
  `AuthContext` — replaces the web `middleware.ts` cookie check and client role routing.
- Bottom tab bars per role (from the web sidebar `navConfig`).

## 6. Feature test checklist — ALL MIGRATED ✅

### Authentication
Login → role home (user→Home, recycler→/recycler, admin→/admin). Token in Keychain/Keystore.
Relaunch restores session. Live-session 401 → auto sign-out → /login.

### Registration + OTP
Name/email/password + role toggle; users pick account type. Submit → OTP stage → verify
(`/auth/verify-otp`) → role home. Resend / change email supported.

### Password reset
Forgot (`/auth/forgot-password`) → confirmation. Reset reads a token from the deep link
`connect2recycle://reset-password?token=…` or manual paste; enforces ≥6 chars + match.

### User dashboard
Welcome + CTA + quick-action tiles; subheading adapts to `user_type`.

### Stores
List with name search (debounced) + location geocode search + waste-type filter +
pickup-available toggle; List/Map toggle (react-native-maps, OSM tiles, OSRM route line);
geolocation; store detail (about, operations, capacity bar, contact tel/mailto, actions);
reviews (avg + list + user add/edit/delete, role-gated).

### Pickup requests (user)
New request: saved-address select or map pin (`useLocation`), waste category, quantity,
optional preferred slot → `POST /pickup-requests`. My Pickups: 10s poll + pull-to-refresh,
cancel/rebook, assigned-store block, **own OTP displayed** on `OTP_PENDING`.

### Drop-off requests (user)
`?storeId=` deep-link preselect or nearest-eligible discovery; waste category from the
store's accepted types; date (DateTimePicker) + slot → `POST /dropoff-requests`. My Drop-offs:
poll + refresh, cancel, OTP display.

### Bookings (legacy)
Store discovery (by id or nearest), eligibility checks, waste type + weight + date/time →
`POST /bookings`.

### Profile (user + recycler)
Account details (`/auth/profile`), password change (`/auth/password`), sign-out
(`/auth/logout` + clear session). Saved addresses CRUD (`/addresses`) for users.

### Recycler
Dashboard (stats, notification bell, My Stores, live New Offers with inline Accept, Active
pickups; 15s poll). Pickup inbox (accept/reject, **recycler enters customer OTP** + actual kg
via `/collect`; details dialog with broadcast history; 10s poll). Drop-off approvals
(approve/reject/cancel, OTP collect). My Stores (list + create/edit with LocationPicker,
accepted-waste-type chips, capacity update, delete).

### Admin
Segmented sections: Overview (KPIs + bar summaries replacing recharts), Stores (verify/reject,
activate/suspend, per-store daily threshold, threshold alerts), Users (recyclers; suspend),
Requests (pickup/dropoff listing), Disputes (list + resolve/reject dialog). Same endpoints,
debounced search, action gating.

### Reviews / Disputes / Notifications
- Reviews: within store detail (create/edit/delete), role-gated to `user`.
- Disputes: admin list + resolve (the web frontend has no user/recycler "raise dispute" screen; backend support is unused there too — parity preserved).
- Notifications: surfaced in-app (recycler dashboard bell + list, profile prefs). No push infra in the backend — see limitations.

## 7. Edge cases to verify
Loading (spinner/skeleton), error (retry), empty states everywhere; geolocation permission
denial (map still usable, manual pin); polling refresh; validation parity with web; OTP expiry.

## 8. Known limitations / documented deviations
- **Password-reset deep link** needs the app scheme / Universal-App-Links configured to
  auto-open; otherwise paste the token. Backend (frozen) still emails the web URL.
- **Push notifications**: backend has none (email + in-app polling). Notifications are in-app;
  APNs/FCM push is a future backend-dependent extension.
- **Maps**: OpenStreetMap raster tiles (no API key). Native Google/Apple tiles can be enabled
  via provider config later. Marker clustering (web used leaflet.markercluster) not ported —
  markers render individually (fine for typical result counts).
- **Location entry**: the web's State→District→City→Locality cascade (Nominatim autocomplete)
  was replaced by text fields + a map-pin `LocationPicker` in the pickup/drop-off/store-form
  flows. The composed address string and POST payloads are unchanged.
- **Preferred pickup slots**: the web multi-slot proposer (up to 5) is reduced to one optional
  date+window producing the same free-form `preferredTimeSlot` string.
- **Device-local personalization** (avatar accent, notification prefs, recycler "seen"
  notifications) is kept in session memory rather than persisted (web used localStorage).
- **Per-type dashboards** (`/dashboard/individual|business|bulk`) consolidated into one
  adaptive `/dashboard` tab that varies copy by `user_type`.
- **Charts** (recharts, admin) rendered as stat cards + proportional bars.
- **framer-motion** entrance animations dropped (static render); no data/behavior lost.
