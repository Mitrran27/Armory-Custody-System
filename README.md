# AAWCS — Armory Access & Weapons Custody System

Two applications sharing one PostgreSQL database:

- **`app/`** — the staff dashboard (SvelteKit) at `/`, plus a separate
  guard-facing installable PWA at `/portal`.
- **`backend/`** — the API (Express + Drizzle ORM) both of the above talk to.

No mock data anywhere — every screen reads from and writes to the real
database. This file covers setup and gives a tour of what exists. For the
original design rationale and the reasoning behind specific decisions
(why the audit trail can't be edited, why Drizzle instead of Prisma, why
guards get a completely separate login from staff), see
**`PROJECT_DESCRIPTION.md`** and **`backend/README.md`**.

```
armory-system/
├── PROJECT_DESCRIPTION.md   design doc + build status
├── backend/                 Express + Drizzle ORM + PostgreSQL API
│   └── README.md            full API reference, roles matrix, design notes
└── app/                     SvelteKit staff dashboard + guard PWA
```

---

## Setup

### 1. Start PostgreSQL

```bash
cd backend
docker compose up -d
```

(Or point `DATABASE_URL` in `.env` at any Postgres you already have.)

### 2. Backend

```bash
cd backend
cp .env.example .env          # defaults already match docker-compose.yml
npm install                   # pure TypeScript, no native binary download
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:4000
```

**If you're updating an existing database and the schema has changed**
(check `backend/README.md`'s changelog, or just try `db:migrate` and see if
it complains), wipe and start clean instead of trying to reconcile:

```bash
npm run db:reset      # drops and recreates the schema — no psql needed
npm run db:migrate
npm run db:seed
```

`db:reset` only needs Node and the `pg` package already in this project, so
it works the same on Windows/macOS/Linux without hunting for `psql` on your
`PATH`.

### 3. Frontend

```bash
cd app
cp .env.example .env          # PUBLIC_API_URL — defaults to http://localhost:4000
npm install                   # also pulls in the qrcode package used by both QR displays
npm run dev                   # http://localhost:5173
```

> **Port matters.** The backend's default `CORS_ORIGINS` only allows
> `localhost:5173`. Running the frontend elsewhere means updating that env
> var and restarting the backend, or every request gets blocked by CORS.

### 4. Sign in

**Staff dashboard** (`http://localhost:5173`) — no passwords, email + a
one-time code. The code is currently always **`123456`** (also printed to
the backend's terminal on each request — see "Passwordless login" below for
why, and what swapping in real email delivery would look like).

| Email | Role |
|---|---|
| `mitrran@cre8iot.com` | admin |
| `jeevasulogan@cre8iot.com` | duty_officer |
| `sasitheran@cre8iot.com` | armorer |
| `pathma@cre8iot.com` | admin |
| `test@cre8iot.com` | auditor |

**Guard portal** (`http://localhost:5173/portal`) — same OTP flow, same dev
code, but a completely separate login from the table above (see "Two
separate front doors" below).

| Guard email | Name | Good for testing |
|---|---|---|
| `matt.armstrong@mg.com` | Cpl Matt Armstrong | Already approved for armory access, already has a firearm checked out |
| `ronaldo@mg.com` | Sgt Ronaldo | No prior application — the "apply from scratch" flow |
| `messi@mg.com` | Pte Messi | No prior application |
| `d.johnson@mg.com` | Cpl D.Johnson | Has a pending *firearm-assignment* request already on file (shows in "Also on file") |
| `tony.stark@mg.com` | Pte Tony Stark | Already has a **pending** armory-access application — open this one to see the pending badge immediately |
| `vijay@mg.com` | Sgt Vijay | Account status is `suspended` — login and apply are both correctly refused |

---

## What's in the staff dashboard

**Dashboard** — live stats, an access-sequence explainer, a recent-events
feed, and current zone occupancy at a glance.

**Live Monitoring** — a real interactive 3D model of the facility (Three.js),
not a diagram. Click a room to fly the camera in; rooms with a rack layout
on file (currently the armory) surface a floating "view layout" button that
tracks the room in real screen-space as you orbit. Clicking it opens a 2D
rack-contents panel built from actual inventory data — firearms grouped by
their real rack, real status colors, no invented fields. Room/camera/door
geometry and the "who's inside right now" list all come from the API, not a
hardcoded config.

**Firearms** — inventory, RFID tag health, checkout/check-in (which
requires an approved firearm-assignment request — see RBAC below), and a
maintenance workflow with a real assign → complete lifecycle: an admin or
duty officer assigns a repair to a specific armorer (the firearm
automatically flips to "maintenance" status so it can't be checked out
mid-repair), and any armorer can mark it done, which returns the firearm to
service.

**Guards** — roster management, suspend/reinstate, and a "Issue QR token"
action that renders a real scannable QR code (not just the raw string) for
Door 1's QR gate.

**Access Requests** — the approval workflow behind two things: a guard
being allowed to physically enter the armory, and a guard being allowed to
check out a *specific* firearm. Staff can file an application on a guard's
behalf; only an admin can approve, reject, or revoke one. Denied attempts
at the door or at checkout are logged as `critical` audit alerts, not just
silently blocked.

**System Users** — admin-only account management for the four RBAC roles
(admin, duty officer, armorer, auditor), each with a description pulled
from a real `roles` table rather than hardcoded labels.

**Audit Trail** — filterable, and genuinely append-only: every event is
SHA-256 hash-chained to the one before it (`npm run verify-audit-chain` in
`backend/` recomputes and checks the whole chain), and there is no edit or
delete route for this resource at all — not even for admins. Exportable to
a JSON file from the UI.

**Notification bell** (top bar, beside the theme toggle) — polls for new
notifications every 5 seconds and shows an unread badge. Right now this
fires for one thing: a guard applying for armory access. Clicking a
notification marks it read and jumps to Access Requests.

**Theme toggle** — light/dark, persisted, no flash of the wrong theme on
load. The 3D monitoring view deliberately stays dark in both themes — like
a camera-monitor panel in professional software, a live surveillance view
reads clearest against dark chrome regardless of the rest of the app.

---

## The guard portal (`/portal`) — a separate PWA, a separate login

Guards don't use the staff dashboard at all. They have their own
installable Progressive Web App:

- **Real installability** — `manifest.webmanifest` (`start_url: /portal`),
  a service worker (network-first; this app is fundamentally online, so the
  service worker exists to make it installable and to ride out a network
  blip, not to fake offline access to live data), and a generated icon set.
- **A completely separate session type from staff**, even though the login
  *flow* looks identical (email → OTP). A guard's JWT carries `type: 'guard'`
  and no `role` field at all — there's no code path where a guard session
  could be mistaken for, or reused as, staff credentials. Guards even have
  their own OTP table, separate from the system users' one.
- **Apply for armory access** — idempotent: applying while a pending or
  approved request already exists just returns that existing one instead of
  filing a duplicate.
- **Live status** — pending / approved / rejected, reflecting whatever an
  admin has decided, checked against the real database on every visit.
- **A real QR code once approved** — rendered client-side from the same
  one-time-token mechanism the staff-issued version uses, just scoped to
  the guard's own account. Every time the QR view is opened, a **genuinely
  new one-time code** is issued (the old one is invalidated) — this was
  confirmed by capturing two separate opens over the network and diffing
  the codes, not assumed. A live countdown shows time to expiry; after it
  lapses, a "Get a new code" button issues another.

---

## RBAC that governs the physical building, not just the API

Having the right *system role* decides what you can do in the dashboard.
It's a separate, additional layer that decides whether a specific **guard**
can walk into the armory or be handed a specific rifle — modeled as an
application that only an `admin` can approve, exactly like the guard portal
above describes from the guard's side.

- **Zone entry**: the armory has `requiresAuthorization = true`. Before
  admitting a guard (via the dashboard's manual entry, or the real QR-scan
  endpoint below), the system checks for an approved `zone_access` request
  for that exact guard. No match → 403, and the attempt is still logged as
  a `critical` audit alert even though nothing else about it persists.
- **Firearm checkout**: same shape — a `firearm_assignment` request must be
  approved for that specific guard + firearm pair before checkout succeeds.
  This is "certain guards can be issued certain firearms": assignment isn't
  implicit from having armory access, it's its own approval.

## Door 1's QR gate is real, not just described

```
POST /api/guards/:id/qr-token          (staff-issued, e.g. from the Guards page)
POST /api/guard/qr-token                (guard's own, from the portal)
POST /api/facility/doors/:doorId/scan   (redeems either kind)
```

A 90-second, single-use code (see `backend/.env` → `QR_TOKEN_TTL_SECONDS`).
Issuing a new one invalidates whichever one that guard already had.
Scanning checks it matches the guard and door, isn't expired, and hasn't
already been used — a second scan of the same code is rejected and logged
as a `critical` alert, since a reused code is a plausible replay attempt.
On success, the guard is admitted into whichever zone that door's room
belongs to via the same underlying logic the dashboard's manual entry uses,
so a QR-gated entry and a manually-recorded one are indistinguishable in
the audit trail apart from the `method` field.

## Passwordless login, for both staff and guards

No password field exists anywhere in this system. `request-otp` issues a
code, `verify-otp` checks it and returns a session token.

**About the `123456` code:** no email/SMS provider is wired up yet, so it's
currently a fixed dev default (`DEV_OTP_CODE` in `backend/.env`), logged to
the console instead of actually sent anywhere. Everything *around* that is
real, though — codes are stored with a genuine expiry, are single-use, and
are checked against the database, not hardcoded in the route handler.
Wiring in a real provider is a one-line change in `auth.routes.ts` /
`guardAuth.routes.ts` (swap the `console.log` for an actual send); nothing
about the request/verify contract changes.

## The database is normalized, not just functional

A few things worth knowing if you're extending the schema:

- `system_users.role` is a real foreign key to a `roles` table, not a bare
  Postgres enum — `GET /api/roles` exists and the System Users page reads
  labels from it rather than hardcoding them.
- `rooms` and `qr_scanners` share their parent's primary key directly
  (`rooms.id` *is* `zones.id`) rather than carrying a redundant synthetic
  key alongside a unique foreign key back to the same parent — the right
  shape for a genuinely one-to-one relationship.
- `doors.connectsToZoneId` is a real nullable foreign key (null = leads
  outside the building), not untyped text holding either a zone id or a
  magic `'outside'` string that a typo could silently corrupt.

---

## A few things worth knowing before you go further

- **SSR is off app-wide** (`app/src/routes/+layout.ts`). Both the staff
  dashboard and the guard portal are JWT-in-localStorage authenticated
  apps; there's no session available during server rendering, so every
  route renders client-side. Deliberate for an internal, always-logged-in
  tool — reconsider it if a public-facing page ever needs SEO.
- **The guard/reader-device auth gap.** QR token issuance and the door-scan
  endpoint are currently reachable by staff roles (and, for their own
  token, by the guard themselves) as a stand-in for what would, in a real
  deployment, be the guard's own device and the physical reader hardware's
  own credential — neither of those has its own auth mechanism yet.
- **Polling, not push**, everywhere live data updates (zone occupancy, the
  audit feed, the notification bell) — a `setInterval` on a few-second
  cycle, not WebSockets/SSE. Fine for a small back-office team; swap the
  relevant store's polling loop for a socket subscription if you need
  sub-second updates.
- **Notifications are role-broadcast, not per-person.** A notification for
  `admin` is visible to every admin, and one admin marking it read clears
  it for all of them. Fine for a small team; if this needs per-person read
  state later, split `read` into its own join table keyed by
  `(notificationId, systemUserId)` rather than changing `notifications`'
  shape.
- **No automated test suite.** Everything described above was verified by
  actually running the app — migrations applied against a live database,
  screenshots of the real rendered UI, network requests captured and
  diffed — but that's manual verification done once while building, not a
  regression-proof test file that runs on every future change.