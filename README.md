# AAWCS — Armory Access & Weapons Custody System

A full-stack deliverable: a SvelteKit frontend wired to a real Express +
PostgreSQL backend. No mock data anywhere in this version — every page
fetches from, and writes to, the API in `backend/`. Includes light/dark
theming and an interactive 3D monitoring view with click-to-zoom rooms and
a rack-layout drill-down — see the changelog near the bottom for details.

```
armory-system/
├── PROJECT_DESCRIPTION.md   original system design doc
├── backend/                 Express + Drizzle ORM + PostgreSQL API
│   └── README.md            full API reference, roles matrix, RBAC/QR/maintenance design notes
└── app/                     SvelteKit frontend (the operator UI)
```

This README covers getting **both halves running together**. For the full
API reference, the roles/permissions matrix, and the reasoning behind
specific backend decisions (why the audit trail can't be edited, why Drizzle
instead of Prisma, how the QR gate and access-request approval flow work),
see **`backend/README.md`** — this file won't repeat all of that.

---

## 1. Start PostgreSQL

```bash
cd backend
docker compose up -d
```

(Or point `DATABASE_URL` at any Postgres you already have — see step 2.)

## 2. Configure and start the backend

```bash
cd backend
cp .env.example .env          # defaults already match docker-compose.yml
npm install                   # pure TypeScript, no native binary download
npm run db:generate           # only needed if you edit src/db/schema.ts
npm run db:migrate            # applies drizzle/*.sql
npm run db:seed               # loads guards, firearms, users, audit history, room layout
npm run dev                   # http://localhost:4000
```

Leave this running in its own terminal.

### Resetting the database

If you already have a database from a previous version of this project and
pull an update that changes `backend/src/db/schema.ts`, `db:migrate` alone
may not be enough — especially if the migration history itself was
rebased/squashed (noted in the changelog below when that happens), in which
case your existing database won't line up with the new migration files at
all. When that happens, wipe and start clean:

```bash
npm run db:reset      # drops and recreates the database schema — no psql needed
npm run db:migrate
npm run db:seed
```

`db:reset` only needs Node and the `pg` package already installed as part
of this project, so it works the same on Windows/macOS/Linux without
needing `psql` on your `PATH` (which a PostgreSQL installer doesn't always
set up, particularly on Windows).

## 3. Configure and start the frontend

In a second terminal:

```bash
cd app
cp .env.example .env          # PUBLIC_API_URL — defaults to http://localhost:4000, already correct
npm install
npm run dev                   # http://localhost:5173
```

Open **http://localhost:5173** — you'll land on `/login`.

> **Port matters here.** The backend's `.env.example` sets
> `CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"`. If you run
> the frontend on a different port, add it to `CORS_ORIGINS` in
> `backend/.env` and restart the backend, or the browser will block every
> request with a CORS error.

## 4. Sign in

There's no password anywhere in this system — email + a one-time code.

1. Enter one of the seeded emails below.
2. Enter the code — for now it's always **`123456`** (also logged to the
   backend's terminal on each request). See `backend/README.md` → "Logging
   in (passwordless OTP)" for why, and what swapping in real email delivery
   later looks like.

| Email | Role | What you'll see |
|---|---|---|
| `ramli.ahmad@mda.gov.my` | admin | Everything, including System Users and approving access requests |
| `siti.rahmah@mda.gov.my` | duty_officer | Can enroll guards, file access requests, assign maintenance — not approve them |
| `zainal.abidin@mda.gov.my` | armorer | Firearm/maintenance management, no user admin |
| `halim.mokhtar@mda.gov.my` | armorer | Same as above — useful for testing "different armorer completes what another assigned" |
| `aisyah.nordin@mda.gov.my` | auditor | Read-only everywhere |

### The guard portal (PWA) is a separate login, at a separate URL

Guards don't use the staff dashboard above at all — they have their own
installable PWA at **`/portal`** (redirects to `/portal/login` if not
signed in), with its own passwordless OTP login, completely separate from
the staff session type. Any seeded guard's email works, same dev OTP:

| Guard email | Name | Notable seeded state |
|---|---|---|
| `aiman.hakim@guard.mda.gov.my` | Cpl Aiman Hakim Rosli | Already has an approved armory access + F-0001 checked out |
| `izzati.zulkifli@guard.mda.gov.my` | Sgt Nur Izzati Zulkifli | No prior application — good for testing the "apply" flow fresh |
| `farid.osman@guard.mda.gov.my` | Pte Farid Danial Osman | No prior application |
| `suresh.kumar@guard.mda.gov.my` | Cpl Suresh Kumar A/L Ganesan | Has a *pending* firearm-assignment request already on file (shows in the "Also on file" section) |
| `wongjw@guard.mda.gov.my` | Pte Wong Jun Wei | Already has a **pending** armory access application — open this account to see the pending badge without applying yourself |
| `ain.yusof@guard.mda.gov.my` | Sgt Nurul Ain Yusof | Account status is `suspended` — login/apply are both correctly refused |

---

## What's actually wired (not just present in both codebases)

- **Auth**: the frontend's login page calls the real
  `POST /api/auth/request-otp` / `verify-otp`, gets a real JWT back, and
  attaches it as `Authorization: Bearer <token>` on every subsequent
  request (`app/src/lib/api/client.ts`). The session is restored from
  `localStorage` on reload and re-validated against `GET /api/auth/me`.
- **RBAC in the UI, not just the API**: the sidebar hides "System Users"
  from non-admins; the "Enroll guard" / "Register firearm" / "Approve"
  buttons only render for roles the backend would actually accept the
  request from. The backend still enforces this independently — the
  frontend hiding a button is a UX nicety, not the security boundary.
- **Dashboard, Guards, Firearms, System Users, Audit Trail, Access
  Requests**: every list, filter, and detail panel reads from the API.
  Guard suspension, firearm checkout/check-in, maintenance assignment and
  completion, and access-request approval/rejection/revocation all make
  real API calls and re-fetch afterward — there's no local-only state
  pretending to be persisted.
- **Live Monitoring (3D view)**: room/door/camera geometry comes from
  `GET /api/facility/rooms` and `GET /api/cameras` — not a hardcoded
  config file. Occupancy (the red/amber/green zone coloring and the
  "Currently inside" list) polls `GET /api/zones` and `GET /api/audit`
  every 4 seconds (`app/src/lib/stores/live.svelte.ts`).
- **QR token issuance**: the Guards page has a real "Issue QR token"
  button that calls `POST /api/guards/:id/qr-token` and displays the
  actual code + expiry the backend generated.

## Verified, not just written

Before handing this over, I ran both servers together and drove the app
through a real headless browser — not just `npm run build` succeeding.
Confirmed: the auth guard redirects an unauthenticated visit to `/login`;
login actually completes and lands on the dashboard with real seeded
counts ("of 6 total roster"); the Guards page lists all 6 seeded guards by
name; a pending access request can be approved from the UI and the list
updates; the Firearms detail panel shows a real maintenance log with the
armorer's name resolved (not just an ID); and the 3D monitoring view
renders at real pixel dimensions with live occupancy data, not a blank
canvas.

## A few things worth knowing before you go further

- **SSR is off app-wide** (`app/src/routes/+layout.ts`). This is a
  JWT-in-localStorage authenticated app; there's no session available
  during server rendering, so every route renders client-side. That's a
  deliberate fit for an internal, always-logged-in ops tool — reconsider it
  if you ever add a public-facing page that needs SEO.
- **The guard/reader-device auth gap from `backend/README.md` still
  applies.** QR token issuance and the door-scan endpoint are reachable by
  staff roles as a stand-in for what would, in production, be the guard's
  own device and the physical reader's own credential.
- **Polling, not push.** The live store refreshes every 4 seconds rather
  than using WebSockets/SSE. Fine for a demo and for most real dashboards;
  swap `live.svelte.ts`'s `setInterval` for a socket subscription if you
  need sub-second updates.

---

## Changelog — database cleanup, theming, monitoring interactions

### Database normalization

Three real issues fixed, each confirmed with `\d` in psql against a live
database, not just reviewed in the schema file:

- **`system_users.role` is now a foreign key to a `roles` table**
  (`system_users_role_id_roles_id_fk`), not a bare Postgres enum. The
  actual database column is `role_id`; the JS-facing field stays `role` so
  RBAC middleware, JWT claims, and route logic needed essentially no
  changes. `GET /api/roles` now exists and the System Users page fetches
  its role labels/descriptions from it instead of hardcoding them.
- **`rooms` and `qr_scanners` now share their parent's primary key**
  instead of carrying a redundant synthetic id plus a separate unique FK
  back to the same parent. A Room only ever exists because a Zone has one
  (`rooms.id` IS `zones.id`, enforced as `rooms_id_zones_id_fk`); same
  pattern for `qr_scanners` → `doors`.
- **`doors.connectsTo` is a real FK now**, not untyped text holding either
  a zone id or the magic string `'outside'`. It's `connectsToZoneId`, a
  nullable FK to `zones` — null means the door leads outside the building
  envelope, and a typo'd zone id can no longer silently pass validation.

Migration history was squashed into a fresh single init (the PK-type
changes weren't cleanly `ALTER`-able over existing dev data, and pre-launch
is a reasonable time to do that) and reapplied to a wiped database, then
reseeded and reverified against `verify-audit-chain`.

### Light / dark theme

Toggle button in the top bar (sun/moon icon). Implemented as a second set
of CSS custom-property values under an `html.light` selector — every
existing utility class (`bg-panel`, `text-ink`, `border-line`, ...) already
resolves through these variables, so no component needed to change to
support it. Preference persists to `localStorage`, with an inline
pre-hydration script in `app.html` so there's no flash of the wrong theme
on load.

One deliberate exception: the Live Monitoring 3D panel stays dark
regardless of the app-wide theme — like a camera-monitor or video-editing
preview panel, a live 3D surveillance view reads clearest against dark
chrome either way, and it avoids re-tuning an entire Three.js material
palette for a second theme.

### Live Monitoring — larger view, brighter status colors, click-to-focus

- The 3D panel is substantially larger (`78vh`, min 620px — was a fixed
  560px) and the Clear/Occupied/Alert colors were brightened, both the 2D
  status pills and the 3D floor tint (kept in sync so they still read as
  the same color system).
- **Click a room to zoom in.** The camera flies to frame that room with an
  eased animation; click empty space (or a different room) to fly back
  out. Room/door/camera labels — which use a fixed world-space size — are
  hidden while zoomed in, since at that distance they'd otherwise blow up
  to cover the screen (a real bug I caught and fixed while verifying this
  against screenshots, not something I anticipated in advance).
- **A "Click to view layout" button tracks the focused room** in real
  screen-space, recomputed every animation frame via `camera.project()` —
  it stays correctly positioned even if you keep orbiting after the
  auto-zoom completes. It only appears for rooms that actually have a rack
  layout on file (currently just the armory).
- **Clicking it opens a 2D rack-contents modal** (`LayoutPanel.svelte`),
  adapted from a warehouse-management reference screenshot but wired to
  this system's real schema: firearms grouped by their actual `rack`
  field, real status colors, the room's real door/gate info. I deliberately
  didn't invent fields like "weight" or "capacity %" that don't exist in
  this domain model just to match the reference more closely — what's
  shown is honest to the data.

**How this was verified:** clicking a room in a real browser and having it
land in exactly the right spot depends on camera projection math that's
easy to get subtly wrong. Rather than trust the code, I drove it with a
headless browser and screenshotted the result: confirmed the fly-in
animation, the floating button tracking the room correctly, the modal
rendering real seeded firearm data grouped into the right racks, and the
fly-back-out on deselect — all shown in actual rendered screenshots, not
inferred from reading the code.


### Guard portal (PWA), armory access applications, and admin notifications

A whole second, separate app: guards apply for armory access and get their
entry QR themselves, instead of everything running through staff.

- **`/portal` is an installable PWA** — real `manifest.webmanifest`
  (`start_url: /portal`), a service worker (`static/sw.js`, network-first —
  this app is fundamentally online, so the service worker exists to make
  the app installable and give the shell a chance to load through a network
  blip, not to fake offline data access), and a generated icon set
  (192/512/512-maskable/apple-touch-icon).
- **Guards get their own login, entirely separate from staff.** Same
  passwordless-OTP shape as the staff login, but a distinct JWT type
  (`GuardSessionClaims` carries `type: 'guard'`, no `role` field) and a
  separate `guard_otp_codes` table — a guard's session can never be mistaken
  for, or reused as, staff credentials, even though both flows look
  identical from the outside.
- **`POST /api/guard/apply-armory`** — a guard applies for entry to the
  armory. Deliberately idempotent: applying while a pending or approved
  request already exists returns that existing one rather than creating a
  duplicate (confirmed with two consecutive calls returning the same ID).
- **Admins get a real notification, not a poll-and-hope.** A new
  `notifications` table gets a row the moment a guard applies; the bell
  icon in the staff TopBar (beside the theme toggle, as asked) polls every
  5s and shows an unread badge. Clicking a notification marks it read and
  jumps to Access Requests.
- **The status loop is real, not simulated.** Guard applies → shows
  "Pending" → admin approves from the existing Access Requests page → guard
  reloads their portal → shows "Approved" with a "Show Entry QR Code"
  button — confirmed end-to-end with a live approve call in between, not
  hardcoded state transitions.
- **The QR code is an actual scannable image**, rendered client-side with
  the `qrcode` package from the real one-time token the backend issues
  (same `POST .../qr-token` mechanism as the staff-issued version, just
  scoped to the signed-in guard's own account). Each time a guard opens the
  QR view, a **genuinely fresh code is issued** — confirmed by capturing
  two separate open events over the network and diffing the codes, not
  assumed from reading the code. A live countdown shows time to expiry;
  after it lapses, a "Get a new code" button issues another one-time token.

**How this was verified:** the same screenshot-driven process as the rest
of this changelog — logged in as a guard with no prior application and
watched the apply button actually produce a "Pending" badge; logged in as
admin and watched the bell's unread count go from 0 to 1 within one poll
cycle of that application; approved it; came back to the guard's portal and
watched it show "Approved"; opened the QR view and confirmed a real
scannable QR image renders with a working countdown, not a placeholder.
