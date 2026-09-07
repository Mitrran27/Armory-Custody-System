# Armory — Deployment Handoff

This droplet already has Postgres, an isolated Docker network, and the
public-facing route wired up. What's left is dropping in the actual
Express + SvelteKit code and starting the app container.

**Stack:** Express + Drizzle ORM (backend) · SvelteKit (frontend) · Postgres
(DB) · Three.js (3D room view, client-side only, no special server setup)

## Server access

```
Host: 206.189.153.31
User: armory
SSH key: armory-deploy (private key alongside this file — armory-deploy.pub is the public half already installed on the server)
```

Connect with:

```
ssh -i armory-deploy armory@206.189.153.31
```

This is a **dedicated, limited account** — it's in the `docker` group (so it
can run `docker compose` commands) but is **not root** and has no access to
the `sg-inventory` production app's files or database. It cannot edit the
shared Caddy (reverse proxy) config — that's intentionally locked down; ping
me if the Caddy site block ever needs changing.

## Domain

`https://armory.ciot.my` is already routed to this server and will serve
whatever is listening on `armory-app:5010` inside the `armory_net` Docker
network. Right now it returns `502` — that's expected until the app
container exists and is named/ported correctly (see below).

## Database

A dedicated Postgres 15 container (`armory-db`) is already running, isolated
from `sg-inventory`'s database — separate container, separate volume,
separate credentials.

```
DATABASE_URL=postgresql://armory_app:rq8fXYLXt2yJ3TljioJLXTRDWbD4vY49@db:5432/armory
```

Note: `db` above is the Docker Compose service name, only resolvable from
*inside* the `armory_net` network — i.e. from your Express app container
once it's added to the same compose file. It is not reachable from the
public internet or from other containers on this box.

Run your Drizzle migrations against this `DATABASE_URL` once the app
container is up and can reach `db`.

## Directory layout

```
/opt/armory/
  docker-compose.yml   ← already exists, defines the `db` service (running)
                          and a commented-out `app` service template
  .env                 ← holds POSTGRES_PASSWORD (already set, matches above)
  frontend-build/      ← empty, reserved for the SvelteKit static build output
                          if you go with adapter-static (see below)
```

## What your team needs to do

1. `ssh -i armory-deploy armory@206.189.153.31`
2. `cd /opt/armory`
3. Add your Express backend as a service in `docker-compose.yml` — there's
   already a commented-out `app` template in that file showing the expected
   shape: it must join the external `armory_net` network, listen on port
   `5010`, bind only to `127.0.0.1:5010` (not `0.0.0.0`), and be named
   `armory-app` (Caddy is already configured to route to that exact name).
4. **Decide the SvelteKit adapter:**
   - **Static (`adapter-static`)** — simplest. Build locally/in CI, copy the
     output into `/opt/armory/frontend-build/`, and tell me so I can add a
     `file_server` directive to the Caddy config for that path.
   - **Node SSR (`adapter-node`)** — needs its own container/port too (e.g.
     `armory-frontend:5011`), and Caddy routes `/` there while `/api` goes
     to the Express container. Tell me if this is the plan and I'll adjust
     the Caddy block accordingly.
5. Run your Drizzle migrations against the `DATABASE_URL` above.
6. `docker compose up -d` to bring the app container up.
7. Test `https://armory.ciot.my` — once the `armory-app` container is
   running and listening correctly, Caddy will start proxying to it
   automatically (no restart needed on my end).

## What NOT to touch

- Anything under `/opt/sg-inventory/` or `/opt/sg-inventory-stage/` —
  separate production app on this same box, fully isolated but still live.
- The Caddyfile itself (`/opt/sg-inventory/Caddyfile`) — the `armory` user
  doesn't have write access to it by design. If the routing setup needs to
  change (different port, adding the frontend's `file_server` block, etc.),
  loop me in rather than trying to edit it directly.
