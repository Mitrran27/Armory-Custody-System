# Armory Access & Weapons Custody System — UI

A SvelteKit 5 + TypeScript + Tailwind v4 front-end for the armory access control
and weapons custody concept described in `PROJECT_DESCRIPTION.md`. This is UI
only — mock data, no backend — built to be visually complete and easy to wire
up to real APIs later.

## Run it

```bash
npm install
npm run dev -- --open
```

## What's here

- **/** — operational dashboard (live stats, event feed, zone occupancy)
- **/monitoring** — rotatable 3D room view (Three.js) with a modular, data-driven
  camera layout (`src/lib/data/system.ts` → `cameras`) and live red/amber/green
  zone-occupancy coloring
- **/firearms** — firearm inventory, RFID tag health, maintenance log
- **/guards** — guard roster, clearance level, biometric/credential status
- **/users** — back-office system users (RBAC: admin / duty officer / armorer / auditor)
- **/audit** — filterable, hash-chained audit trail

## Structure

```
src/lib/types.ts            domain types (Guard, Firearm, AuditEvent, CameraConfig, ...)
src/lib/data/                mock data — swap these for real API calls
src/lib/stores/live.svelte.ts  simulated live occupancy + event feed (Svelte 5 runes)
src/lib/components/          Sidebar, TopBar, Panel, StatusPill, StatCard, RoomScene3D
src/routes/                  one folder per page listed above
```

## Notes for wiring to a real backend

- `src/lib/data/*.ts` are the mock data sources — replace with `+page.ts`/`+page.server.ts`
  loaders or client fetch calls to your API, keeping the same TypeScript shapes in `types.ts`.
- `src/lib/stores/live.svelte.ts` simulates the live feed with a timer; swap the
  `advance()` internals for a WebSocket/SSE subscription and it drives the whole UI
  (zone colors, event feed, occupant lists) the same way.
- Camera layout (`cameras` in `src/lib/data/system.ts`) is intentionally just data —
  point it at a real camera-registry endpoint and the 3D scene (`RoomScene3D.svelte`)
  needs no changes to support new cameras.
