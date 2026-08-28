# AAWCS Backend

Express + TypeScript + PostgreSQL API for the Armory Access & Weapons Custody
System. Pairs with the SvelteKit frontend built earlier — same domain model,
same roles, same soft-delete-everywhere-except-the-audit-trail philosophy.

## Why Drizzle instead of Prisma

Prisma's CLI downloads a native query-engine binary from `binaries.prisma.sh`
the first time you run a migration. That's a normal public CDN for most
setups, but it's exactly the kind of unfamiliar third-party download an
agency network is likely to block at the firewall — and a backend that fails
to migrate on a locked-down network isn't a usable deliverable. Drizzle ORM
is pure TypeScript with no native binary and no install-time CDN fetch, so it
behaves identically on an open laptop and a restricted government network.
Functionally it does the same job as Prisma: typed schema, migrations, a
typed query builder.

## Stack

- **Express 5** — HTTP framework
- **Drizzle ORM** + **node-postgres (`pg`)** — schema, migrations, queries
- **Zod** — request validation
- **jsonwebtoken** — session tokens (passwordless/OTP login, see below)
- **express-rate-limit** — throttles the OTP endpoints

## 1. Set up PostgreSQL

Pick one:

**Option A — Docker (recommended):**
```bash
docker compose up -d
```

**Option B — a Postgres you already have running:**
Just make sure you have a database and a user that can create tables in it.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and check `DATABASE_URL` matches your Postgres (the default
matches the `docker-compose.yml` in this repo, so if you used Option A you
don't need to change anything). For anything beyond local dev, replace
`JWT_SECRET` with a real secret:
```bash
openssl rand -hex 32
```

## 3. Install dependencies

```bash
npm install
```

No native binaries, no post-install download — this is the whole install step.

## 4. Run migrations

```bash
npm run db:generate   # only needed if you've changed src/db/schema.ts
npm run db:migrate     # applies drizzle/*.sql to your database
```

## 5. Seed data

```bash
npm run db:seed
```

This loads the exact dataset the frontend ships with as mock data: 3 zones,
the room/door/camera layout matching your floor-plan sketch, 5 system users
(one per role), 6 guards, 6 firearms with maintenance history, and a
genuinely hash-chained sequence of 10 audit events (each one's hash is
computed from the previous one at seed time — it's not just backfilled
strings that happen to look like hashes).

Re-running `db:seed` against a non-empty database will fail on unique
constraints (email, serial, RFID tag, etc.) — that's intentional, so you
don't silently double-seed. Wipe the tables or use a fresh database to reseed.

## 6. Run the server

```bash
npm run dev      # tsx watch mode
# or
npm run build && npm run start
```

Server listens on `http://localhost:4000` by default (`PORT` in `.env`).
`GET /health` is unauthenticated and always available for a quick check.

## 7. Point the frontend at it

Set `CORS_ORIGINS` in `.env` to wherever your SvelteKit dev server runs
(default already covers `http://localhost:5173`). The frontend from the
earlier zip currently uses in-memory mock data (`src/lib/data/*.ts`) and a
simulated live store (`src/lib/stores/live.svelte.ts`) — wiring it to this
API means replacing those with `fetch` calls carrying an
`Authorization: Bearer <token>` header. That wiring isn't done yet; this
backend is a complete, independently-runnable API ready for that next step.

---

## Logging in (passwordless OTP)

There's no password field anywhere in this system — sign-in is email + a
one-time code.

```
POST /api/auth/request-otp   { "email": "ramli.ahmad@mda.gov.my" }
POST /api/auth/verify-otp    { "email": "ramli.ahmad@mda.gov.my", "code": "123456" }
```

`verify-otp` returns `{ token, user }`. Send `token` back as
`Authorization: Bearer <token>` on every other request.

**About the `123456` code:** no email/SMS provider is wired up yet, so
`request-otp` always issues `DEV_OTP_CODE` from `.env` (default `123456`)
and logs it to the server console instead of sending it anywhere. The rest
of the flow is real, though — codes are stored with a real expiry
(`OTP_TTL_MINUTES`), are single-use (`consumedAt`), and are checked against
what's in the database, not hardcoded in the route handler. Wiring in a real
provider later is a one-line change in `src/routes/auth.routes.ts` (swap the
`console.log` for an actual send) — nothing about the request/verify contract
changes.

Every seeded system user logs in with the same dev OTP:

| Email | Role |
|---|---|
| ramli.ahmad@mda.gov.my | admin |
| siti.rahmah@mda.gov.my | duty_officer |
| zainal.abidin@mda.gov.my | armorer |
| halim.mokhtar@mda.gov.my | armorer |
| aisyah.nordin@mda.gov.my | auditor |

---

## Roles & permissions

Four roles, matching the frontend's System Users page exactly:
`admin`, `duty_officer`, `armorer`, `auditor`.

| Resource | Read | Create | Update | Delete / Restore |
|---|---|---|---|---|
| System Users | admin | admin | admin | admin |
| Guards | any authenticated role | admin, duty_officer | admin, duty_officer | admin |
| Firearms | any authenticated role | admin, armorer | admin, armorer | admin, armorer |
| Firearm checkout / check-in | — | admin, armorer, duty_officer\* | — | — |
| Maintenance records | any authenticated role | admin, armorer | admin, armorer | admin, armorer |
| Maintenance assign / complete | — | admin, duty_officer (assign); admin, armorer (complete) | — | — |
| Cameras | any authenticated role | admin | admin | admin |
| Rooms / Doors / QR scanners | any authenticated role | — | — | — |
| Zones (status/label) | any authenticated role | — | admin, duty_officer | — |
| Zone entry / exit | — | admin, duty_officer, armorer\* | — | — |
| Access requests (apply) | any authenticated role | admin, duty_officer, armorer | — | admin |
| Access requests (approve/reject/revoke) | — | **admin only** | — | — |
| QR token issue / door scan | — | admin, duty_officer, armorer\*\* | — | — |
| Audit trail | any authenticated role | admin, duty_officer (manual entries only) | **nobody, ever** | **nobody, ever** |

\* Requires an **approved access request**, not just the role — see below.
\*\* Stand-in for real guard/reader device auth — see "Physical access" below.

These are reasonable starting defaults, not a spec handed down from
elsewhere — adjust the `requireRole(...)` calls in `src/routes/*.ts` to
match your agency's actual policy. The one row that isn't a "default" and
that you probably shouldn't loosen is the audit trail: see below.

## Physical access is RBAC-gated too, not just the API

Having the right *system role* (e.g. `armorer`) is necessary to operate this
backend, but it's not what decides whether a given **guard** can walk into
the armory or be handed a specific rifle — that's a separate layer, modeled
as an application a guard's supervisor files and only `admin` can approve.

**Zone entry (`access_requests.type = 'zone_access'`).** Zone C (the armory)
has `requiresAuthorization = true`. Before `POST /api/zones/:id/entry` (or a
QR/facial door scan) admits a guard into an authorization-gated zone, it
checks for an **approved**, non-revoked `zone_access` request for that exact
guard + zone. No match → 403, and — this matters — the attempt still gets
logged as a `critical` audit alert even though nothing else about it
persists. Zones A and B aren't gated this way (their own QR/facial checks
are the control there); flip `requiresAuthorization` on any zone via
`PATCH /api/zones/:id` if your layout needs more than just the armory gated.

**Firearm issue (`access_requests.type = 'firearm_assignment'`).**
Same shape: `POST /api/firearms/:id/checkout` now requires an **approved**
`firearm_assignment` request for that specific guard + firearm pair before
it will hand the weapon out. This is "certain guards can be issued certain
firearms" — assignment isn't implicit from having armory access; each
firearm a guard is authorized for is its own approved request.

**The application/approval workflow** (`src/routes/accessRequests.routes.ts`):
```
POST   /api/access-requests              file an application
POST   /api/access-requests/:id/approve  admin only
POST   /api/access-requests/:id/reject   admin only
POST   /api/access-requests/:id/revoke   admin only — pulls a previously approved authorization
GET    /api/access-requests              filter by type / status / guardId / firearmId
```

**Who files the application?** Guards don't hold system logins in this
design (see the OTP section below — only back-office staff do), so
`admin`/`duty_officer`/`armorer` file requests on a guard's behalf — think
"the guard's supervisor submits the paperwork," which matches how this
would actually work operationally. Only `admin` can decide it.

## Door 1's QR gate, for real

The original brief called for "a QR code active for a few minutes, scanned
at the door to enter." That's now actually implemented, not just described:

```
POST /api/guards/:id/qr-token   { doorId? }         -> { code, expiresAt, ttlSeconds }
POST /api/facility/doors/:doorId/scan  { code, guardId }
```

Issuing a token invalidates any still-live token that guard already had at
that door, so there's only ever one valid code per guard/door pair. The
default TTL is 90 seconds (`QR_TOKEN_TTL_SECONDS` in `.env` — see the
original design doc for the reasoning). Scanning checks the code matches
that guard and door, hasn't expired, and hasn't already been consumed —
**a second scan of the same code is rejected** (`409`) and logged as a
`critical` alert, since a reused code is a plausible replay attack. Scanning
a door whose `gate` isn't `'qr'` (Door 2 is `'facial'`) is rejected outright.
On success, the guard is admitted into whichever zone that door's room
belongs to — the exact same `admitGuardToZone` logic
`POST /api/zones/:id/entry` uses, so a QR-gated entry and a manually-recorded
one are indistinguishable in the audit trail apart from the `method`.

**DEV NOTE, same spirit as the OTP placeholder below:** both of these routes
are currently reachable by staff roles as a stand-in. In a real deployment,
the guard's own device would call `qr-token` (after its own device-level
auth — a separate concern from the back-office OTP login this backend
implements) and the physical reader hardware would call `scan` with its own
device credential, not a staff JWT. Swapping those in is a routing/auth
change, not a redesign — the validation and zone-admission logic stays.

## Maintenance now has an assignment step, not just a log

Previously `POST /api/firearms/:id/maintenance` only logged work already
done. Now there's a real "assign it to the person in charge, then they
close it out" flow, tracked via `maintenance_records.status`:

```
POST /api/firearms/:id/maintenance/assign   { armorerId, work, nextDue }
  -> creates a record with status "assigned", flips the firearm to
     "maintenance" status (so it can't be checked out mid-repair)

POST /api/firearms/maintenance/:recordId/complete   { work? }
  -> status -> "completed", records completedAt, returns the firearm to
     "in_armory" (or pass { "returnToService": false } to decommission it
     instead)
```

`POST /api/firearms/:id/maintenance` (the original endpoint) still exists
for logging a maintenance action that's already fully done in one step —
useful for backfilling history — and defaults `status` to `"completed"`.

## The audit trail is deliberately not like the others

Every other resource in this system supports full CRUD plus soft delete,
exactly as asked. The audit trail doesn't, on purpose: it has no `deletedAt`
column and there is no `PATCH` or `DELETE` route for it anywhere in
`src/routes/audit.routes.ts` — not even for `admin`. An audit trail that can
be quietly edited or soft-deleted by the same roles it's supposed to be
watching isn't providing much assurance.

Instead, integrity comes from hash-chaining: every event's `hash` is a
SHA-256 of its own content *plus* the previous event's hash
(`src/utils/auditHash.ts`). Editing or deleting a historical row — even
directly in the database, bypassing the API — breaks the chain from that
point forward, and it's detectable:

```bash
npm run verify-audit-chain
```

This walks every event in insertion order, recomputes each hash, and
reports exactly which record(s) broke the chain. Run it after seeding to see
it pass, then try hand-editing a row's `detail` column directly in Postgres
and run it again to see it fail — that's the property this design is for.

If your agency's compliance requirements call for something beyond
"detectable" (e.g. a append-only table enforced at the database level with
`REVOKE UPDATE, DELETE`, or write-once storage), that's a reasonable next
step on top of this — the hash chain still gives you the ability to prove
integrity even if you add DB-level enforcement too.

---

## API reference

All routes except `/health` and `/api/auth/*` require
`Authorization: Bearer <token>`. Soft-deletable resources support
`?includeDeleted=true` on their list endpoint (for roles allowed to see
deleted records) and a `POST /:id/restore` route.

```
GET    /health

POST   /api/auth/request-otp
POST   /api/auth/verify-otp
GET    /api/auth/me

GET    /api/users                     (admin)
GET    /api/users/:id                 (admin)
POST   /api/users                     (admin)
PATCH  /api/users/:id                 (admin)
DELETE /api/users/:id                 (admin — soft delete)
POST   /api/users/:id/restore         (admin)

GET    /api/guards
GET    /api/guards/:id
POST   /api/guards                    (admin, duty_officer)
PATCH  /api/guards/:id                (admin, duty_officer)
DELETE /api/guards/:id                (admin — soft delete)
POST   /api/guards/:id/restore        (admin)
POST   /api/guards/:id/qr-token       { doorId? } — issue a 90s one-time QR code

GET    /api/firearms                  (includes nested maintenance[])
GET    /api/firearms/:id
POST   /api/firearms                  (admin, armorer)
PATCH  /api/firearms/:id              (admin, armorer)
DELETE /api/firearms/:id              (admin, armorer — soft delete)
POST   /api/firearms/:id/restore      (admin, armorer)
POST   /api/firearms/:id/checkout     { guardId }  — requires an approved firearm_assignment
POST   /api/firearms/:id/checkin

GET    /api/firearms/:id/maintenance
POST   /api/firearms/:id/maintenance            log a completed action directly    (admin, armorer)
POST   /api/firearms/:id/maintenance/assign     { armorerId, work, nextDue }        (admin, duty_officer)
POST   /api/firearms/maintenance/:recordId/complete   { work? }                     (admin, armorer)
PATCH  /api/firearms/maintenance/:recordId      (admin, armorer)
DELETE /api/firearms/maintenance/:recordId      (admin, armorer — soft delete)
POST   /api/firearms/maintenance/:recordId/restore (admin, armorer)

GET    /api/zones                     (includes current occupants + room layout)
GET    /api/zones/:id
PATCH  /api/zones/:id                 (admin, duty_officer)
POST   /api/zones/:id/entry           { guardId, method } — requires approved zone_access if the zone is gated
POST   /api/zones/:id/exit            { guardId }

GET    /api/access-requests           ?type ?status ?guardId ?firearmId
GET    /api/access-requests/:id
POST   /api/access-requests           { type, guardId, zoneId | firearmId, notes? }  (admin, duty_officer, armorer)
POST   /api/access-requests/:id/approve   (admin only)
POST   /api/access-requests/:id/reject    (admin only)
POST   /api/access-requests/:id/revoke    (admin only)
DELETE /api/access-requests/:id           (admin — soft delete)
POST   /api/access-requests/:id/restore   (admin)

GET    /api/cameras
POST   /api/cameras                   (admin)
PATCH  /api/cameras/:id               (admin)
DELETE /api/cameras/:id               (admin — soft delete)
POST   /api/cameras/:id/restore       (admin)

GET    /api/facility/rooms            (read-only — see note below)
GET    /api/facility/doors
GET    /api/facility/qr-scanners
POST   /api/facility/doors/:doorId/scan   { code, guardId } — redeem a QR token, admits into the door's zone

GET    /api/audit                     ?type ?severity ?zoneId ?firearmId ?from ?to ?limit
GET    /api/audit/:id
POST   /api/audit                     (admin, duty_officer — manual entries: override/admin_action/alert)
```

**Note on `/api/facility`:** the frontend's monitoring page only ever
displays rooms/doors/QR scanners, so those three haven't been given
create/update/delete routes yet — cameras did, since the frontend explicitly
calls out camera placement as "modular." If you need to edit room geometry
or door placement through the API rather than by re-seeding, add
`POST`/`PATCH`/`DELETE` routes to `src/routes/facility.routes.ts` following
the same pattern as `cameras.routes.ts`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` / `npm run start` | Compile then run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:reset` | Drop and recreate the database schema (both `public` and Drizzle's own `drizzle` tracking schema) — no `psql` required. Use before `db:migrate` when your existing database predates a squashed/rebased migration history. |
| `npm run db:push` | Push schema directly without a migration file (prototyping only) |
| `npm run db:studio` | Open Drizzle Studio to browse the database |
| `npm run db:seed` | Load the seed dataset |
| `npm run verify-audit-chain` | Recompute and check every audit event's hash |

---

## What's verified vs. what's left as a next step

Everything above was actually run against a live PostgreSQL instance while
building this, not just written and assumed to work — including this
round's additions. On top of the original pass (migrations, seed, login as
three roles, RBAC denial, checkout/checkin, soft delete/restore), this round
specifically exercised over HTTP:

- A guard **without** an approved `zone_access` request tried to enter the
  armory → 403, and confirmed a `critical` audit alert was logged for the
  attempt anyway.
- A guard **with** an approved request entered successfully.
- A firearm checkout was correctly blocked with no approved
  `firearm_assignment`, a `duty_officer` was correctly refused when trying
  to approve it (`admin`-only), then an `admin` approved it and the same
  checkout that failed a moment earlier succeeded.
- Issued a QR token, scanned it at Door 1 (correctly admitted into Zone B —
  the room that door belongs to), replayed the same code (409, and logged
  as a critical alert), and confirmed scanning a facial-gated door with a
  QR code is rejected outright.
- Assigned a firearm's maintenance to one armorer, confirmed the firearm
  flipped to `maintenance` status, had a **different** armorer mark it
  complete, confirmed the firearm returned to `in_armory`, and confirmed
  completing an already-completed record correctly 409s.
- Re-ran `verify-audit-chain` after all of the above — **19 events, chain
  intact.**

Not done yet, and worth knowing before you deploy this anywhere real:

- **No automated test suite.** The verification above was manual `curl`
  exercises of the main paths, not a regression-proof test file.
- **No real OTP delivery, and no real guard/reader device auth.** Both the
  OTP login and the QR issue/scan endpoints use staff JWTs as a stand-in for
  what would, in production, be their own separate auth mechanisms — see the
  notes in each section above.
- **No production process manager / Docker image for the API itself** — only
  Postgres has a `docker-compose.yml`. Containerizing the Node process is a
  reasonable next step.
- **Rooms/doors/QR scanners are read-only via the API** (see note above).
- **The frontend isn't wired to this API yet** — it still runs on its own
  in-memory mock data.
