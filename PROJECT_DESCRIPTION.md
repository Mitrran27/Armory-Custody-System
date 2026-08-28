# Armory Access & Weapons Custody System (AAWCS)
**Prepared for:** Malaysian Defense Agency — Armory Access Control
**Document type:** System description & functional requirements
**Status:** Draft v0.3 — original design spec (v0.2, §1–10 below) plus an
implementation status against it, and a write-up of what was built beyond
the original brief (§11–13). This document is now a living design +
status doc, not just a pre-build spec — see `README.md` for setup and a
feature tour of the running system.

---

## Implementation status at a glance

| Area | Status |
|---|---|
| Zone A/B/C physical layout, guard flow | ✅ Built — 3D-modeled, real occupancy state |
| QR gate (§3.1, §4) | ✅ Built — 90s single-use tokens, real scan/redeem endpoint |
| Facial recognition gate (§3.2) | ⏳ Not built — modeled as a manual/API-triggered "facial" entry method; no actual camera/vision integration |
| RFID firearm detection (§3.3) | ⏳ Not built — firearm state changes via explicit checkout/check-in actions, not passive RFID threshold reads |
| Live Monitoring / 3D room view (§5.1) | ✅ Built, and further along than spec'd — click-to-zoom rooms, a rack-contents drill-down panel |
| Firearm Management (§5.2) | ✅ Built, including a real assign → complete maintenance workflow |
| Guards Management (§5.3) | ✅ Built |
| User Management / RBAC (§5.4) | ✅ Built, and extended — see §11 |
| Audit Trail (§5.5) | ✅ Built — genuinely hash-chained and append-only, verifiable via a script |
| Reconciliation & alerting (§6) | ⏳ Partial — denied-entry and denied-checkout attempts are logged as critical alerts; no continuous background reconciliation job yet |
| §9.1 Duress/panic signal | ⏳ Not built |
| §9.2 Shift/roster tie-in | ⏳ Not built |
| §9.3 Tag tamper detection | ⏳ Partial — a `tagHealth` field exists (ok/weak/tamper) and is surfaced in the UI; nothing automatically flips it yet |
| §9.4 Visitor/escort mode | ⏳ Not built |
| §9.5 Chain-of-custody signature | ⏳ Partial — checkout/check-in are explicit, logged, atomic actions; no biometric/PIN re-confirm step at the moment of custody transfer |
| §9.6 Offline-degraded mode | ⏳ Not built |
| §9.7 Tamper-evident audit log | ✅ Built — SHA-256 hash chain, `npm run verify-audit-chain` |
| §9.8 Emergency lockdown & manual override | ⏳ Partial — a manual `override` audit event type exists for logging one; no dedicated lockdown flow |
| §9.9 Reporting/export | ⏳ Partial — audit trail exports to JSON from the UI; no scheduled reports |
| **Beyond original scope**: physical-access RBAC (approval workflow gating armory entry + firearm issue) | ✅ Built — see §11 |
| **Beyond original scope**: guard self-service portal (installable PWA) | ✅ Built — see §12 |
| **Beyond original scope**: admin notifications | ✅ Built — see §13 |

---

## 1. Purpose

Replace manual paper/logbook tracking of armed guards entering the armory and
drawing/returning firearms with a layered, sensor-driven access-control and
custody-tracking system that produces a tamper-evident audit trail end to end.

## 2. Physical layout

| Zone | Description |
|---|---|
| **Zone A — Approach / Corridor** | Outside the outer door. Guard is not yet inside any controlled space. |
| **Zone B — Outer Room (Staging Room)** | Entered after QR scan. Facial recognition checkpoint lives here. No firearms present. |
| **Zone C — Inner Room (Armory / Weapons Vault)** | Entered after facial match from Zone B. Contains the RFID-tagged firearm racks. |

Guard flow: **Zone A → QR scan at outer door → Zone B → facial match → Zone C → take/return firearm (RFID) → reverse path out.**

*Built as described. The 3D Live Monitoring view models exactly this
layout — Zone C's north/east walls are literally Zone B's outer walls,
matching the original floor-plan sketch — and zone occupancy state
(clear/occupied/alert) reflects real entry/exit events, not a static
diagram.*

## 3. Access control sequence

1. **QR gate (Zone A → B)**
   - Guard opens the agency mobile app / issued hardware token, which displays a QR code.
   - QR code is scanned at a wall-mounted reader beside the outer door.
   - On valid scan: door unlocks, event logged (guard ID, timestamp, door ID, result).
   - *Built. The guard's PWA (§12) is the "agency mobile app" — it requests a
     token from the backend and renders a real scannable QR image. A
     `POST /api/facility/doors/:doorId/scan` endpoint is the reader: it
     validates the token, checks it hasn't been used or expired, and admits
     the guard, logging the event exactly as described.*
2. **Facial recognition gate (Zone B → C)**
   - Camera at the Zone B/C threshold captures a live frame.
   - Matched against the guard's enrolled facial template.
   - On match: inner door unlocks; event logged (guard ID, timestamp, match confidence, camera ID).
   - *Not built. There's a `facial` entry method and a corresponding audit
     event type, and the dashboard's manual "record an entry" action can
     use it — but there's no actual camera capture, template matching, or
     liveness detection. This is the biggest gap between spec and build.*
3. **Firearm RFID detection (inside Zone C, and at the Zone C threshold)**
   - Fixed RFID antenna array at the Zone C doorway plus shelf-level readers on the racks.
   - Any tagged firearm crossing the threshold is logged automatically: which tag, direction (out/in), timestamp, and — by correlating with the facial-recognition event that admitted the guard — **which guard**.
   - No manual scan-out step required from the guard; detection is passive.
   - *Not built as passive detection. Firearm state changes happen through
     explicit `checkout`/`checkin` actions (by the guard's own assigned
     armorer/duty-officer, or staff on the dashboard) rather than a
     background RFID read — the audit trail records who took/returned what
     and when, but the trigger is an API call, not a sensor event.*

## 4. QR code design

- **Validity window:** recommend **90 seconds**, auto-refreshing on the app (not a static multi-minute code). A window this short balances usability (guard has time to walk up and be scanned) against the risk of a captured/screenshotted code being reused later. If field testing shows guards frequently missing the window, extend to 120s — but avoid multi-minute codes, since they're a bigger replay-attack surface.
  - *Built exactly as recommended: 90 seconds by default, configurable via
    `QR_TOKEN_TTL_SECONDS`.*
- **One-time use:** each code is invalidated the instant it's scanned once, regardless of remaining time.
  - *Built. A second scan of an already-used code is rejected (409) and
    logged as a critical audit alert, on the theory that a reused code is a
    plausible replay attempt worth flagging, not just silently blocking.*
- **Content:** signed token (not just a guard ID) — e.g., guard ID + issued-at timestamp + nonce, signed server-side, verified by the reader online or against a short-lived offline key cache. Prevents forged/replayed codes.
  - *Built as a server-generated random token stored server-side and
    validated online (not a self-contained signed JWT the reader verifies
    offline) — simpler, and sufficient given the reader endpoint always has
    network access to the backend in this deployment. An offline-verifiable
    signed-token variant would be a reasonable evolution if readers ever
    need to work without connectivity (see §9.6).*
- **Fallback:** PIN + supervisor override for token/device loss, itself logged as an exception event.
  - *Not built.*

## 5. Core modules

### 5.1 Live Monitoring / 3D Room View
- Rotatable, pannable 3D model of the room layout (both zones).
- Camera **positions are data-driven/modular**: each camera is an entry in a layout config (position, orientation, FOV, coverage zone, linked room) rather than hand-placed 3D geometry — adding a physical camera means adding a config row, not editing the scene.
- Each monitored zone highlights **red** while occupied / an event is active, **green** when clear — driven by real-time occupancy state (door + facial-recognition + RFID events), not just raw motion.
- Camera nodes show live/offline status independent of room occupancy (a camera can be offline while the room is still occupied — that's an alertable state, not a display gap).

*Built, and taken further than originally specified: clicking a room flies
the camera in with an animated transition; rooms with rack data on file
surface a floating "view layout" button (tracked in real screen-space as
you orbit, not a fixed overlay) that opens a 2D rack-contents panel built
from live firearm inventory. Camera and room data both come from the
database via `GET /api/cameras` and `GET /api/facility/rooms` — adding a
physical camera is a database row via the Cameras page, not a code change,
matching the "data-driven/modular" requirement above literally.*

### 5.2 Firearm Management
- Inventory of every firearm: serial number, RFID tag ID, type/model, caliber, assigned rack/slot, current status (in armory / checked out / in maintenance / decommissioned), current holder (if checked out).
- Maintenance log per firearm: service date, armorer, work performed, next-due date, round count if tracked.
- Alerts for overdue maintenance and for tag/read anomalies (see §9.3).

*Inventory and maintenance log built as described (round count was not
implemented — not currently tracked). The maintenance workflow goes beyond
a log: an admin/duty-officer can **assign** a repair to a specific armorer
(the firearm automatically flips to "maintenance" status, blocking
checkout), and any armorer can mark it **complete**, returning the firearm
to service — a real two-step workflow, not just a completed-record log.
Overdue-maintenance and tag-anomaly alerting (§9.3) is partial — see the
status table above.*

### 5.3 Guards Management
- Guard roster: name, ID/rank, unit, clearance level, photo, biometric enrollment status, device/token status.
- Per-guard history: entries/exits, firearms drawn/returned, shift assignments.
- Suspension/revocation control (immediately invalidates QR + facial credentials).

*Built. "Photo" is initials-based (no actual photo upload/storage).
Suspension is built and does immediately block that guard's ability to log
in to the portal or have new access requests approved — an already-approved
access request is not automatically revoked on suspension, so if that
matters operationally, revoke their access requests explicitly at the same
time as suspending them.*

### 5.4 User Management (system/admin users — distinct from guards)
- Accounts for armorers, duty officers, auditors, system admins.
- Role-based access control (RBAC): who can edit inventory vs. who can only view audit trails vs. who can approve overrides.
- MFA on all system-user accounts (guards use QR+face; back-office users use a standard MFA login).

*Built, with one substitution: both guards and back-office staff use the
same passwordless email+OTP mechanism rather than staff using a distinct
"standard MFA login" — see the README's "Passwordless login" section for
why, and what a real email/SMS provider swap-in looks like. Roles are a
real database table (not a hardcoded enum), with a full permissions matrix
documented in `backend/README.md`. RBAC now extends beyond "who can edit
what in the dashboard" to "which specific guard can enter the armory or be
issued a specific firearm" — see §11, which goes well past what this
section originally asked for.*

### 5.5 Audit Trail
- Immutable, append-only log covering: door/zone entries & exits, facial-match attempts (including failures), firearm taken/returned events, maintenance actions, manual overrides, and system-user admin actions.
- Every record is hash-chained (or otherwise tamper-evident) so a record can't be silently edited or deleted after the fact — this matters for an armory audit trail more than for typical business logs.
- Filterable/searchable by guard, firearm, date range, event type; exportable for regulatory review.

*Built faithfully, including the hash-chaining: every event's hash covers
its own content plus the previous event's hash, so editing or deleting any
historical row — even directly in the database, bypassing the API entirely
— breaks the chain from that point forward, and `npm run verify-audit-chain`
detects exactly that. There is deliberately no update or delete route for
this resource anywhere in the codebase, for any role, including admin.
Filtering and export are built; "date range" filtering specifically is
supported by the API (`from`/`to` query params) though not yet exposed as
a date-picker in the UI filter bar.*

## 6. Reconciliation & alerting

- **Continuous reconciliation:** system compares "firearms currently marked checked-out" against "RFID tags currently absent from the rack." A mismatch (e.g., a tag crosses the threshold without a valid preceding facial-recognition admit) raises an immediate alert.
- **Time-based alerts:** firearm not returned within its expected window; guard remains in Zone C beyond a configured dwell time; QR issued but never used to complete facial match (possible credential compromise).
- **Delivery:** alerts to duty officer dashboard + SMS/push, with severity levels (info/warning/critical).

*Not built as continuous/background reconciliation (there's no passive RFID
layer to reconcile against — see §3.3). What is built: **event-driven**
alerting at the moment something suspicious happens rather than on a
schedule — an unauthorized zone-entry attempt, an unauthorized firearm
checkout attempt, a reused or expired QR code — each logged immediately as
a `critical` or `warning` audit event with the severity levels described
here. Delivery is in-dashboard only (the notification bell, §13); no
SMS/push integration.*

## 7. Security & compliance notes

- All biometric templates and audit data encrypted at rest and in transit.
- Data handling aligned with Malaysia's Personal Data Protection Act (PDPA) for biometric data, plus any applicable defense-sector data-handling directives — confirm the specific classification requirements with the agency's security office before finalizing storage/retention design.
- Fail-secure vs. fail-safe door behavior must be explicitly decided per door (armories typically fail-secure, but this must respect fire-egress code — confirm with facilities/safety).
- Backup power for readers/locks/cameras; defined offline-degraded-mode behavior (e.g., supervisor manual key + logged paper fallback that gets reconciled into the digital log afterward).

*Unchanged — these remain open, real-world/hardware/compliance concerns
that a software build doesn't resolve on its own. No biometric templates
are stored at all currently (there's no facial recognition, §3.2), which
sidesteps the biometric-specific PDPA question for now but doesn't answer
it for whenever that capability is actually added.*

## 8. Non-functional requirements

- Facial recognition must include **liveness detection** (anti-spoofing against photos/video/masks).
- System should support **anti-passback**: a guard can't badge in twice without badging out, and can't "hand off" a valid session to someone else physically tailgating through the door.
- All camera feeds and 3D layout must degrade gracefully — an offline camera should be visibly flagged, not silently dropped.
- Target uptime, response-time (QR verify, facial match) and false-accept/false-reject rate targets should be set with the agency and vendor (recommend FAR ≤ 0.001% for a defense-grade deployment as a starting negotiation point, to be validated against the chosen recognition vendor's certified numbers).

*Liveness detection: n/a, no facial recognition built. Anti-passback: not
enforced — the system does not currently prevent a guard's QR/session from
being reused by a second person tailgating through an already-unlocked
door. Camera offline handling: built — a camera's online/offline status is
tracked and shown distinctly in the 3D view regardless of zone occupancy,
exactly as specified. Uptime/response/FAR targets: not applicable without
a facial-recognition vendor selected.*

## 9. Additions vs. the original brief (gaps identified)

The following weren't in the original description and were recommended
additions at design time. Status against each is in the table at the top
of this document; the two both fully built — tamper-evident audit log (§9.7)
and, arguably, most of chain-of-custody (§9.5) — are described in detail
under §5.5 and §5.2 above respectively.

1. **Duress/panic signal** — a guard under coercion can enter a duress PIN or press a hidden panic input that outwardly grants access normally but silently alerts the duty officer.
2. **Shift/roster tie-in** — access should be checked against the duty roster; a guard scanning in outside their assigned shift is at minimum a flagged anomaly.
3. **Tag tamper detection** — RFID tags support tamper-evident status (physically removing/damaging a tag from a firearm raises an alert), since a firearm without a functioning tag is invisible to the passive detection system.
4. **Visitor/escort mode** — a supervised-access flow for non-armory personnel (auditors, maintenance contractors) who aren't in the guard roster but need logged, escorted entry.
5. **Chain-of-custody signature** — each checkout/return event captures a confirmation step (biometric re-confirm or PIN) tying the specific person to the specific firearm at that moment, beyond just "was in the room."
6. **Offline-degraded mode** — defined behavior and manual fallback procedure if network/cloud connectivity drops, with later reconciliation into the permanent log.
7. **Tamper-evident audit log** — hash-chaining / write-once storage so the audit trail itself can't be quietly edited, which is a step beyond a normal CRUD-backed activity log.
8. **Emergency lockdown & manual override** — a documented, logged, supervisor-approved override path for drills, emergencies, or hardware failure.
9. **Reporting/export** — scheduled reconciliation reports and exportable audit logs formatted for regulatory/inspector review.

## 10. Open questions for the agency

- Facial recognition vendor/on-prem vs. cloud requirement (likely on-prem only, for a defense context).
- Exact data classification and retention period for biometric + audit data.
- Fire-egress / life-safety constraints on fail-secure door behavior.
- Whether guard-issued QR codes live on agency-issued hardware tokens or personal devices (personal devices raise their own security questions).

*Still open — none of these were decided during the build, since they're
policy/procurement questions rather than engineering ones. Worth noting:
the guard PWA (§12) was built device-agnostically, so it works the same
whether the agency ultimately issues dedicated hardware or allows personal
devices — that decision can still be made later without rework.*

---

## 11. Physical-access RBAC (built beyond the original brief)

The original brief's RBAC (§5.4) was about dashboard permissions — who can
edit inventory, who can only view the audit trail. During the build, this
was extended to govern the physical building itself: having the *system
role* of, say, `armorer` doesn't by itself mean a specific **guard** is
allowed to walk into the armory or be handed a specific rifle. That's
modeled as an application a guard files (or that's filed on their behalf)
that only an `admin` can approve — two kinds:

- **Zone access** — is this guard allowed into an authorization-gated zone
  (currently just the armory)? Checked on every entry attempt, whether
  triggered manually from the dashboard or via a real QR-scan at the door.
- **Firearm assignment** — is this guard allowed to be issued *this specific*
  firearm? Checked on every checkout attempt.

Both denial paths log a `critical` audit alert even though the entry/checkout
itself doesn't go through — the attempt is the thing worth recording, not
just the outcome. This significantly strengthens §5.3's "suspension
control" idea: suspending a guard's ability to be issued firearms doesn't
require a special mechanism, it's the same approval gate everyone goes
through, and an admin can also explicitly `revoke` a previously-approved
request at any time (e.g., reassigning a guard away from armory duty).

## 12. Guard self-service portal (built beyond the original brief)

The original brief only ever described a guard-facing "agency mobile app"
in passing (§3.1, §10) as the thing that displays the QR code. What was
actually built is a full self-service portal, delivered as an installable
Progressive Web App at `/portal`, entirely separate from the staff
dashboard:

- Guards log in with their own passwordless email+OTP flow — a genuinely
  separate session type from staff (see the README for why this matters
  security-wise, not just organizationally).
- A guard can **apply for armory access** themselves, see their
  application's live status (pending/approved/rejected), and — once
  approved — **generate their own entry QR code**, all without a staff
  member touching the dashboard on their behalf.
- This directly answers part of §10's open question about where guard QR
  codes live: on whatever device the guard installs the PWA to, agency
  hardware or personal, since the flow doesn't assume either.

## 13. Admin notifications (built beyond the original brief)

§6 asked for alert *delivery* to "the duty officer dashboard + SMS/push."
What's built is real-time (polled) in-dashboard delivery for one specific
event so far: **a guard applying for armory access**. A `notifications`
table gets a row the moment that happens; the dashboard's notification bell
polls every 5 seconds, shows an unread-count badge, and clicking a
notification marks it read and jumps to the Access Requests page to act on
it. SMS/push delivery, and notifications for other event types (e.g.
critical audit alerts), are natural extensions of the same mechanism but
aren't built yet.