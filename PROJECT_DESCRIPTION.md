# Armory Access & Weapons Custody System (AAWCS)
**Prepared for:** Malaysian Defense Agency — Armory Access Control
**Document type:** System description & functional requirements
**Status:** Draft v0.2 (incorporates reviewer additions — see §9)

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

## 3. Access control sequence

1. **QR gate (Zone A → B)**
   - Guard opens the agency mobile app / issued hardware token, which displays a QR code.
   - QR code is scanned at a wall-mounted reader beside the outer door.
   - On valid scan: door unlocks, event logged (guard ID, timestamp, door ID, result).
2. **Facial recognition gate (Zone B → C)**
   - Camera at the Zone B/C threshold captures a live frame.
   - Matched against the guard's enrolled facial template.
   - On match: inner door unlocks; event logged (guard ID, timestamp, match confidence, camera ID).
3. **Firearm RFID detection (inside Zone C, and at the Zone C threshold)**
   - Fixed RFID antenna array at the Zone C doorway plus shelf-level readers on the racks.
   - Any tagged firearm crossing the threshold is logged automatically: which tag, direction (out/in), timestamp, and — by correlating with the facial-recognition event that admitted the guard — **which guard**.
   - No manual scan-out step required from the guard; detection is passive.

## 4. QR code design

- **Validity window:** recommend **90 seconds**, auto-refreshing on the app (not a static multi-minute code). A window this short balances usability (guard has time to walk up and be scanned) against the risk of a captured/screenshotted code being reused later. If field testing shows guards frequently missing the window, extend to 120s — but avoid multi-minute codes, since they're a bigger replay-attack surface.
- **One-time use:** each code is invalidated the instant it's scanned once, regardless of remaining time.
- **Content:** signed token (not just a guard ID) — e.g., guard ID + issued-at timestamp + nonce, signed server-side, verified by the reader online or against a short-lived offline key cache. Prevents forged/replayed codes.
- **Fallback:** PIN + supervisor override for token/device loss, itself logged as an exception event.

## 5. Core modules

### 5.1 Live Monitoring / 3D Room View
- Rotatable, pannable 3D model of the room layout (both zones).
- Camera **positions are data-driven/modular**: each camera is an entry in a layout config (position, orientation, FOV, coverage zone, linked room) rather than hand-placed 3D geometry — adding a physical camera means adding a config row, not editing the scene.
- Each monitored zone highlights **red** while occupied / an event is active, **green** when clear — driven by real-time occupancy state (door + facial-recognition + RFID events), not just raw motion.
- Camera nodes show live/offline status independent of room occupancy (a camera can be offline while the room is still occupied — that's an alertable state, not a display gap).

### 5.2 Firearm Management
- Inventory of every firearm: serial number, RFID tag ID, type/model, caliber, assigned rack/slot, current status (in armory / checked out / in maintenance / decommissioned), current holder (if checked out).
- Maintenance log per firearm: service date, armorer, work performed, next-due date, round count if tracked.
- Alerts for overdue maintenance and for tag/read anomalies (see §9.3).

### 5.3 Guards Management
- Guard roster: name, ID/rank, unit, clearance level, photo, biometric enrollment status, device/token status.
- Per-guard history: entries/exits, firearms drawn/returned, shift assignments.
- Suspension/revocation control (immediately invalidates QR + facial credentials).

### 5.4 User Management (system/admin users — distinct from guards)
- Accounts for armorers, duty officers, auditors, system admins.
- Role-based access control (RBAC): who can edit inventory vs. who can only view audit trails vs. who can approve overrides.
- MFA on all system-user accounts (guards use QR+face; back-office users use a standard MFA login).

### 5.5 Audit Trail
- Immutable, append-only log covering: door/zone entries & exits, facial-match attempts (including failures), firearm taken/returned events, maintenance actions, manual overrides, and system-user admin actions.
- Every record is hash-chained (or otherwise tamper-evident) so a record can't be silently edited or deleted after the fact — this matters for an armory audit trail more than for typical business logs.
- Filterable/searchable by guard, firearm, date range, event type; exportable for regulatory review.

## 6. Reconciliation & alerting

- **Continuous reconciliation:** system compares "firearms currently marked checked-out" against "RFID tags currently absent from the rack." A mismatch (e.g., a tag crosses the threshold without a valid preceding facial-recognition admit) raises an immediate alert.
- **Time-based alerts:** firearm not returned within its expected window; guard remains in Zone C beyond a configured dwell time; QR issued but never used to complete facial match (possible credential compromise).
- **Delivery:** alerts to duty officer dashboard + SMS/push, with severity levels (info/warning/critical).

## 7. Security & compliance notes

- All biometric templates and audit data encrypted at rest and in transit.
- Data handling aligned with Malaysia's Personal Data Protection Act (PDPA) for biometric data, plus any applicable defense-sector data-handling directives — confirm the specific classification requirements with the agency's security office before finalizing storage/retention design.
- Fail-secure vs. fail-safe door behavior must be explicitly decided per door (armories typically fail-secure, but this must respect fire-egress code — confirm with facilities/safety).
- Backup power for readers/locks/cameras; defined offline-degraded-mode behavior (e.g., supervisor manual key + logged paper fallback that gets reconciled into the digital log afterward).

## 8. Non-functional requirements

- Facial recognition must include **liveness detection** (anti-spoofing against photos/video/masks).
- System should support **anti-passback**: a guard can't badge in twice without badging out, and can't "hand off" a valid session to someone else physically tailgating through the door.
- All camera feeds and 3D layout must degrade gracefully — an offline camera should be visibly flagged, not silently dropped.
- Target uptime, response-time (QR verify, facial match) and false-accept/false-reject rate targets should be set with the agency and vendor (recommend FAR ≤ 0.001% for a defense-grade deployment as a starting negotiation point, to be validated against the chosen recognition vendor's certified numbers).

## 9. Additions vs. the original brief (gaps identified)

The following weren't in the original description and are recommended additions:

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
