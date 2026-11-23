# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FaMiLiS is a browser-based food testing system: testers join a testing room on a kiosk/phone, give consent, are recorded by camera while tasting, and fill in a 9-point hedonic survey. Frames are scored for facial valence (FER) and admins see live monitoring and analytics. It is deployed as a set of containers on Docker Desktop Kubernetes (namespace `familis`). `README.md` has the full first-time deployment steps (Traefik, metrics-server, certs, secrets, image load).

## Repository layout (big picture)

- `kiosk-image/FaMiLiS/` — the main app (image `familis-app:k8s`). One container runs **both**:
  - React 19 + Vite + TypeScript + Tailwind frontend (`src/`), served by the Vite dev server on 5173 (the container runs `vite`, not a static build — see `kiosk-image/start.sh`).
  - Express + Socket.IO API (`server/server.js`, port 8080). Vite proxies `/api`, `/config`, `/uploads`, `/socket.io` to it (`vite.config.ts`).
  - `backend/` holds the older standalone Python emotion-model scripts/training; not used by the k8s deployment path.
- `central-server/` — Python FastAPI (image `familis-central-server:latest`). The same image runs two deployments: `central-api` (`app/main.py`, frame ingest at `/api/ingest/frame`, dashboard and command routers) and `fer-worker` (`app/worker.py`, a Kafka consumer that scores frames with the `.pkl` models in `models/`, autoscaled 1–6 by HPA).
- `k8s/base/` — Kustomize manifests (apply with `kubectl apply -k k8s/base --validate=false`): familis, central-api, fer-worker, kafka/zookeeper (+ `kafka-init` job creating the 6-partition `video-frames` topic), mysql, ingress.
- `monitoring/` — Prometheus/Grafana Helm values and dashboards.
- `scripts/` — PowerShell operational scripts (start/stop/check/backup/new certificate/rebuild).

Data flow: `Kiosk browser -> Express API -> central-api -> Kafka (video-frames) -> fer-worker -> MySQL + shared frame storage -> dashboard`. Express forwards frames to `${CENTRAL_SERVER_URL}/api/ingest/frame` using `INTERNAL_API_TOKEN`.

Live monitoring is WebRTC between tester and admin browsers, with Socket.IO as signaling (STUN only, no TURN — see README "If a monitoring camera is blank"). Tester presence uses a 90 s reconnect lease (`TESTER_RECONNECT_TIMEOUT_MS`) renewed by `tester-recording-heartbeat`.

## Key architecture notes

- **`server/server.js` is a single ~4000-line file** holding all routes, auth, socket handlers and background jobs. Routes declared before `app.use("/api", requireAuth)` are public (login, signup, health, public-access, consent form); everything after is authenticated.
- **Auth:** signed token in the `familis_session` cookie (secret `AUTH_TOKEN_SECRET`, 12 h TTL). Roles are `admin`, `staff`, `tester`. Server-side gates: `requireAuth`, `requireAdmin`, `requireTabAccess(tab)` (role-to-tab permissions stored in preferences). Each request also re-checks the user row (active / `access_revoked_at`) via the pure helpers in `server/accessControl.js` — keep that module free of Express/MySQL so it stays unit-testable.
- **Frontend routing** (`src/App.tsx`) mirrors this: `RequireAuth`, then `RequireTabAccess` for admin tabs and `RequireRole allowed={[...]}` for role-specific flows (tester pages are `Tester*` / `/tester-*`).
- **Database schema:** `server_database/schema.sql` is the base; `server/init.js` (`initDb`, called at server start) applies idempotent migrations with `addColumnIfMissing` / `addIndexIfMissing`. Add schema changes there in the same idempotent style rather than only editing `schema.sql`, since existing MySQL volumes are not recreated.

## Commands

Frontend/API (run in `kiosk-image/FaMiLiS/`):

```powershell
npm install
npm run dev        # Vite on 5173 (proxies to API on 8080)
npm run server     # Express API on 8080 (needs MySQL via DB_* env vars)
npm run lint       # eslint
npm run build      # tsc -b && vite build (use as the typecheck)
node --test "tests/*.test.mjs"              # all tests (quoted glob; a bare directory arg fails on Node 22)
node --test tests/access-control.test.mjs   # single test file
node --test --test-name-pattern "revokes" tests/access-control.test.mjs   # single test by name
```

Tests use the built-in `node:test` runner (no Jest/Vitest). `reconnect.test.mjs` imports the `typescript` devDependency, so run `npm install` first. `tests/reconnect.test.mjs` **extracts code from source text** (`server.js`, `VideoMonitoring.tsx`, `TesterSession.tsx`) by searching for exact strings such as `    socket.on("<name>",` and `function clearTesterReconnectTimer(`, then runs it in a `vm` sandbox. Renaming, re-indenting or moving those functions/handlers breaks the test — update the test when you do.

Deploying a change to the running cluster (repo root, Windows):

```powershell
.\scripts\rebuild-familis-app.ps1    # rebuild familis-app only, import into the node, restart deployment/familis
.\scripts\start-familis.ps1          # full start (flags: -SkipBuild, -NoPortForward, -PublicAccess)
.\scripts\check-familis.ps1          # status
.\scripts\stop-familis.ps1           # stop port-forward/tunnel (-DeleteNamespace to tear down)
.\scripts\backup-familis.ps1         # MySQL dump to .familis\backups
```

Images are not pushed to a registry: they are `docker save`d and imported into the Docker Desktop node with `ctr`, then re-tagged to `familis-app:k8s` / `familis-central-server:latest`. Changes to `central-server/` need that image rebuilt and `central-api` + `fer-worker` restarted (README sections 6–7, 9).

Useful checks: `kubectl -n familis logs deployment/familis --tail=120`, `curl -k https://localhost:5173/api/health` (needs the Traefik port-forward `kubectl -n traefik port-forward --address 0.0.0.0 svc/traefik 5173:443`).

## Repo conventions

- `certs/`: only the public CA files (`familis-root-ca.pem`, `familis-ca.cer`, `.srl`) are tracked. Private keys and the server cert (`familis-root-ca-key.pem`, `cert.pem`, `key.pem`) are gitignored — never commit them. Regenerate with `scripts/new-familis-certificate.ps1`.
- Runtime state (PID files, logs, backups) lives in `.familis/` (gitignored).
- Work happens on per-person feature branches off `main` (e.g. `andre-...`, `janelle-branch`); don't commit directly to `main`.
- Primary dev environment is Windows/PowerShell; scripts are `.ps1`. Files use LF in the repo (expect CRLF warnings on Windows).
