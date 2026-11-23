# FaMiLiS: Context Handoff from Claude Chat
_Source: claude.ai chat/project · Exported: 2026-11-23_

> Read this first: this document was written by a Claude instance that worked in a claude.ai Project ("Capstone 2 ChauFER") through the Claude desktop app (Cowork), with a cloud sandbox plus a bridge to the user's Windows computer. The cloud sandbox could edit the user's repo folder but could NOT run Docker or kubectl. Everything marked **(unverified)** was not confirmed by running it. The user's name in the account is "dreii". Memory/Project notes were nearly empty, so most context below comes from the chat itself.

---

## 1. Project overview

**What it is.** FaMiLiS (the repo/directory name) is currently called **ChauFER** (the capstone's name). It is a multi-kiosk Facial Emotion Recognition (FER) food-testing system. Testers log in on a browser ("kiosk"), join a food "testing room", consent, record themselves tasting a food product while frames are sent to a backend that scores emotion (valence / hedonic score), then fill in a product evaluation survey. Admins/staff monitor kiosks live, manage foods, participants and users, and view statistics.

**Capstone context.**
- Course/document code seen in uploaded file names: `CAP-2518-IT` (the user's docs are named `Copy_CAP-2518-IT-CAP2DOC.md`). The institution "DLSU" appeared in the docs (**unverified** here, I no longer have the doc text). The user calls it "IT Capstone Project 2" (CAP2).
- The Claude Project is named **"Capstone 2 ChauFER"** with description: "To implement the needed features from revision". "Revision" means panel/adviser feedback revision requests.
- Team members and their roles: **None discussed**.
- Adviser / panel names: **None discussed**. The user said they will show the adviser a progress checklist (see Section 3).
- Deadlines/defense dates: **None discussed**.

**Goals.** Implement the features requested after revision (Admin Management, Kiosk Control, and Monitoring Improvements, see Section 6), keeping the existing architecture and conventions.

**Scope/limitations as defined in chat.**
- The "kiosk" is effectively the tester's browser, tied to the tester account. All kiosk/camera controls are per tester account (a `users` row), not per registered physical device.
- User explicitly said to ignore for now: device registration, room-code hardening, and "app code delivered to testers" question.
- Admin-only for all new control features.
- No audit log (no new audit table).

**Tech stack (from repo inspection).**
- Frontend: React 19 + Vite + TypeScript + Tailwind (in `kiosk-image/FaMiLiS/src`).
- API: Express 4 + Socket.IO in `kiosk-image/FaMiLiS/server/server.js` (ESM, mysql2 pool, bcryptjs).
- Central API: FastAPI (`central-server/app`), Kafka topic `video-frames` (6 partitions) + Zookeeper, `fer-worker` (MediaPipe FaceMesh + sklearn, HPA 1–6), MySQL 8 (database `familis_central`), Traefik ingress, Prometheus/Grafana monitoring.
- Deployment: Kubernetes. The README says Docker Desktop's built-in Kubernetes; monitoring values and the access guide mention kind (a documentation discrepancy, **unresolved**). The user confirmed they run it on **Docker Desktop**.

---

## 2. Project knowledge files

The Claude Project's knowledge base was **empty** (0 docs, 0 files). The three files below were attached directly to the chat (not saved in the Project), and I no longer have their full text, only what I summarized earlier. They live in the user's repo/docs; the repo copies are authoritative.

| File (as named in chat) | Summary / use |
|---|---|
| `FaMiLiS_Metrics_Local_Access_Guide.md` | Access guide for local/metrics access (Prometheus/Grafana monitoring, how to reach services locally). Mentions kind clusters. Used to understand how to reach monitoring. |
| `Copy_CAP-2518-IT-CAP2DOC.md` | The CAP2 capstone paper/documentation (project context, architecture, requirements). Source for project overview and architecture; used to cross-check the code. |
| A "WALKTHROUGH … Manual" markdown (exact file name was truncated in my notes) | System walkthrough/user manual describing the tester/admin flow. Used to compare documented features against the code. |

Which is latest/authoritative: **unknown** (the CAP2DOC file is named "Copy_…", so it may be a copy; the user should confirm). Key finding from comparing docs to code: the docs describe a WebSocket kiosk registry (`central-api /ws/kiosk`, `/api/commands`), but the code's actual control plane is Socket.IO rooms in the Express server; the central-api WebSocket endpoints are unused.

---

## 3. Current state

### Finished (implemented in the repo; only compile-/unit-test-verified, see Section 8)
**Admin user management**
- Hard delete users (admin can delete another admin, never self) `DELETE /api/users/:userId`.
- Reset access = admin sets a temporary password and the user is signed out everywhere `POST /api/users/:userId/reset-access`.
- Last-active-admin protection (cannot delete, deactivate or demote the last active admin); cannot change own role/active status.
- Server-side access revocation: deactivated/deleted/reset accounts are rejected on every request and on socket handshake (DB-backed check, 5 s cache).
- Users page and Users API are admin-only (the `users` tab was removed from the grantable tabs for staff).
- `last_login` now written on login and shown in the Users list.
- UI: "Reset access" and "Delete" buttons, type-the-username confirmation for delete (`UserDeleteDialog.tsx`), toasts reporting whether the live kiosk was notified.
- Fixed destructive seeding in `server/init.js` (it used to reset `admin123` and tester01–30 on every restart).

**Kiosk / camera control (admin only, enforced server-side)**
- `PATCH /api/users/:userId/kiosk-controls` with `{kioskEnabled?, cameraEnabled?}` (tester accounts only).
- `POST /api/users/:userId/end-session` ends a tester's live session.
- Enforcement points: `POST /api/sessions/start`, frame upload route, `POST /api/testing-rooms/validate`, socket `join-room`.
- Tester side (`TesterSession.tsx`): handles `session-ended-by-admin`, `kiosk-controls-changed`, blocks Start while disabled, reports camera state, signs out on `access-revoked`.

**Monitoring UI (`VideoMonitoring.tsx`)**
- Kiosk cards show chips: "Kiosk off", "Camera off", "Camera blocked in browser", "Camera not active", "No frames for Ns".
- New "Disabled" status filter.
- Admin control panel (Disable/Enable camera, Disable/Enable kiosk, End live session) in the video modal and the spotlight view, with `window.confirm` and an inline result message.

**Follow-up fixes after the user's testing feedback (implemented, not confirmed live)**
- Camera preview did not reappear for the admin after disable → re-enable. Fix: admin page recreates its WebRTC peer connection when a new offer arrives on an already-negotiated one and drops connections on `kiosk-controls-updated`; tester rejoins the room when the kiosk is re-enabled; server emits `user-disconnected` when it removes a tester from rooms.
- Preview too big (user had to zoom out to reach the buttons). Fix: video capped at `max-h-[40vh]`, modal `max-w-3xl` and scrollable.
- "End live session" (and, by my interpretation, Disable camera / Disable kiosk when they end a live session) now sends the tester to the product evaluation survey after ~1.5 s, like a normal stop.

### In progress
- **Deployment of the new build to the user's Docker Desktop cluster.** Last check (before the final three fixes were built) showed `https://localhost` still serving OLD code (the container runs the Vite dev server, so I fetched `/src/pages/AdminUsers.tsx` and `/src/pages/VideoMonitoring.tsx` over the browser and neither contained the new code). I never confirmed a successful redeploy.
- The user then reported **"it didn't work"** (which build/feature was not specified). **Root cause not diagnosed.** First thing to check: whether the rebuilt image was actually deployed (see Section 8, commands).

### Blocked
- Running Docker/kubectl from the Claude chat/Cowork environment: the cloud sandbox has no Docker/kubectl, the user's linked Linux VM has none either, and terminals are click-only in computer-use. So the user has to run the PowerShell script themselves. (Claude Code running on the user's own machine does not have this limit.)
- End-to-end browser testing: I did not sign in or exercise any of the features (the old build was served), and testing the camera needs a second browser logged in as a tester with a camera permission prompt.

### Upcoming deadlines, defenses, deliverables
**None discussed.** The user wants a progress checklist to show their capstone adviser (the checklist given in chat is reproduced in Section 7).

---

## 4. Decisions made

### Process decisions
- Investigation + plan first, **no code changes until approval**. The user approved implementation with the message **"do whats necessary"**.

### Architecture / control-plane
- Controls are keyed per tester account (`users` row), because "The kiosk is the browser itself and it feels like they are connected to the tester accounts". Rejected/deferred: device registration, per-device tokens, room-code hardening ("Stage 7"), delivering an "app code" to testers.
- Camera control is **separate** from kiosk availability. Chosen answer: "Different, per tester account (Recommended)".
- Enforcement is **DB-backed**, so a disabled/revoked state holds even when the tester's socket is offline. Admin API responses report whether the live kiosk was actually notified (`notified`, `endedSessions`).
- `requireAuth` became async with a short-TTL (5 s) per-user cache invalidated by every admin mutation; JWT-like cookie now includes `iat`; role is taken from the DB row (role changes now take effect immediately).
- Follow the existing conventions: new columns are added via `addColumnIfMissing` in `server/init.js` (NOT `schema.sql`, and `mysql-init-configmap.yaml` was left untouched; it is a drifted older copy).

### Deployment
- Rebuild only the `familis-app` image; load it into the Docker Desktop node's containerd; retag as `familis-app:k8s`; `kubectl -n familis rollout restart deployment/familis`. Script created: `scripts/rebuild-familis-app.ps1`.
- No Kubernetes manifest or Docker image structure changes were made. (The container runs `start.sh`: API on 8080 via `npm run server` and `npm run dev -- --host 0.0.0.0` on 5173.)

### FER model
**None discussed** (no changes to the FER worker/model).

### Database
- New `users` columns: `access_revoked_at TIMESTAMP NULL`, `last_login TIMESTAMP NULL`, `kiosk_enabled TINYINT(1) NOT NULL DEFAULT 1`, `camera_enabled TINYINT(1) NOT NULL DEFAULT 1`.
- **Hard delete** users (user's words: "hard delete"). Deleting a user also: deletes `emotion_results` rows for their sessions (no FK exists on that table), deletes the matching `participants` row (matched by email), removes their frame image files and participant photo from disk, and reassigns `testing_rooms.created_by` to the acting admin (that FK is ON DELETE CASCADE, so rooms would otherwise vanish).
- Seeding in `init.js` changed: default admin is created/restored only when there is no active admin (or env `RESET_DEFAULT_ADMIN=true`; restore also sets `access_revoked_at = NOW()`); default testers `testerNN@familis.com` (01–30) are seeded once, guarded by `app_settings` key `default_testers_seeded` (inserted with `JSON_QUOTE('true')`); if any `testerNN@familis.com` already exists only the flag is set. The `food_products` seed (food_id 1 "Flavored Dip") is unchanged.

### Auth / roles
- Quote from user: "hard delete. also the admin can remove another admin but it cannot change other roles to prevent having the website not having an admin existing." My interpretation (confirmed by the user's selection "Always keep at least one admin (Recommended)"): block removing or demoting the **last active admin** and block removing/demoting/deactivating self; **other role changes stay allowed**.
- Reset access: "Temp password + force logout (Recommended)". Admin sets the temporary password; the account's old tokens are revoked (`access_revoked_at = NOW()`, token `iat <= revoked_at` rejected) and live sockets dropped. If the admin resets their **own** access: only the password changes (no self-revoke).
- PATCH `/api/users/:id` now also revokes access on password change, role change, or deactivation (except for self), and validates password length ≥ 6.
- Users tab/API: admin-only. `hasRoleTabAccess` returns false for `users` for non-admins; `grantableTabs` no longer contains `"users"`; stored staff permissions for `users` are ignored (staff who had it lose it, a default I announced and the user did not object to).
- Tester token carries no new role; all new routes use `requireAdmin`.

### Camera vs kiosk semantics (confirmed by the user)
- Camera disabled: tester can log in, join a room, and take the survey, but **cannot record**. A live session is ended as incomplete (existing stop behaviour: `status='pending'`, `end_time` set). Tester cannot start until the admin re-enables. User quote: "end the session, yes it should disable the session until the admin enables it for the tester to use".
- Kiosk disabled: tester cannot join rooms or record, and is removed from their room; a live session is ended as incomplete.
- Admin can also end a live session without disabling anything. User quote: "end a live one. basically its like a 2-way for the admin and tester. if the tester can end their recording session, the admin should also do the same if some testers lets say do unnecessary things that is recorded. They can disable the camera or end the live one."
- Admin actions need confirmations (`window.confirm` is the existing convention; typed-username confirm for delete) and clear success/failure feedback.
- Latest decision: ending a session from the admin side (End live session, and also Disable camera / Disable kiosk when they end a live session) takes the tester to the survey. User's wording: "make the end live session also make it proceed to the product evaluation survey since the disable camera and disable kiosk kinda have some similarities to it". I applied it to all three, which is my interpretation. **Confirm with the user.**
- Survey route behaviour (verified by reading code): `POST /api/sessions/:sessionId/survey` accepts any session status and then sets the session to `completed`. So a survey submitted after an admin-ended session flips that session from incomplete to completed.

### UI/UX
- Existing "kiosk" view (`VideoMonitoring.tsx`) already had layouts (icon-grid, sidebar-spotlight, pinned-grid, show-all), filter chips, sort, search, and a video modal; I extended it rather than redesigning (card overview, details + video on select, not all streams at once, as requested).
- Preview height capped at 40vh; modal `max-w-3xl` and scrollable.

### Documentation / paper / manuals structure
**None discussed.**

---

## 5. Open questions and unresolved issues

1. **User reported "it didn't work"** after the last redeploy request; the symptom was not described. Needs: which feature, what they saw, which build was running. Likely suspects: the new image not actually deployed (the container serves source via the Vite dev server baked into the image, so a stale image shows old code), or the WebRTC re-offer fix not being sufficient.
2. Camera preview after re-enable: the admin sees video only while the tester is **recording**; after re-enable the tester must press Start Session again. Not confirmed in a browser **(unverified)**. If the admin pc races (tester sends several offers: `viewer-connected` + `stream-request`), a stale answer could still mismatch the latest tester peer connection; the existing 5 s retry loop in `VideoMonitoring.tsx` (up to 3 attempts after 15 s) is the fallback.
3. "End live session / Disable" → survey for **all three** actions was my interpretation; confirm.
4. After an admin-ended session, submitting the survey marks it `completed` (see Section 4). Decide whether admin-ended sessions should stay `pending/incomplete`.
5. `lastFrameAt` (for the "No frames for Ns" chip) is a server timestamp compared with the admin browser clock, and refreshes only on the 5 s `/api/kiosks/testers` poll: clock skew can mislead.
6. All presence/rooms state (`rooms`, `testerPresenceSockets`, `testerCameraStatus`, `testerLastFrameAt`, reconnect timers) lives **in the Express process memory**: single replica only; restart clears it until testers reconnect.
7. Pre-existing issues noticed, not fixed: `DELETE /api/participants/:id` deletes the tester user directly (does not invalidate the access cache, drop sockets, or clean sessions' files/emotion results); `DELETE /api/sessions/:id` leaves `emotion_results` rows; ESLint reports ~17 pre-existing errors (e.g. `react-refresh/only-export-components` in `RequireAuth.tsx`, `react-hooks/purity` for `Date.now()` in `VideoMonitoring.tsx` line ~300, unused `data` at ~1095); room code uses `Math.random`; `buildShareLink` unused; `schema.sql`/`mysql-init-configmap.yaml` drift; `central-api /ws/kiosk` and `/api/commands` unused; doc says kind, README says Docker Desktop.
8. `git status` shows ~181 modified files that are line-ending/file-mode noise from the Windows mount; only `certs/familis-root-ca.pem` and `.srl` had real content diffs. Not caused by my edits.
9. A **Kubernetes MCP server** (tools `mcp__remote-devices__Kubernetes_MCP_Server__*`, e.g. `kubectl_get`, `kubectl_rollout`, `kubectl_logs`) appeared in the tool list at the very end of the chat. I never used or verified it. In Claude Code you can run `kubectl` directly.
10. No panel/adviser written feedback was pasted into the chat beyond the feature request in Section 6.

Risks: deploying changes the DB schema automatically on API startup (4 `ALTER TABLE ADD COLUMN`s via `init.js`); seeding behaviour change means the default admin password is no longer reset on restart: if the user relied on that to recover access, use `RESET_DEFAULT_ADMIN=true`.

---

## 6. Requirements and constraints

### The feature request (title: "FaMiLiS – Admin Management, Kiosk Control, and Monitoring Improvements")
My notes of its items:
- Admin user management: remove users, reset access, permissions, revoke access.
- Per-kiosk camera enable/disable, **separate from kiosk availability**.
- Kiosk status view.
- Per-kiosk monitoring layout: icon/cards overview, details plus video on select (not all streams at once).
- Explain the "tester access code" (my answer: it is the 6-digit **room code** `testing_rooms.room_code`, one active per food, validated via `POST /api/testing-rooms/validate`, enforced in `POST /api/sessions/start`; generated with `Math.random`, **my analysis from the code**).

Quoted constraints from the user's request:
- "Clearly distinguish between existing functionality and proposed functionality."
- "If something cannot be verified, explicitly state that it is unknown."
- "Do not introduce a control that cannot actually communicate with or affect the intended kiosk"
- "Follow the existing architecture and development conventions. Avoid unnecessary architectural changes and dependencies."
- Initial strict instruction (later lifted by "do whats necessary"): investigate and plan only; do not modify source, create/delete project files, modify DB schemas, run migrations, install dependencies, change Docker/deploy configs, or rewrite components; "Do not begin implementation. Wait for my explicit approval and subsequent feature-specific instructions."
- Earlier phases: "Do not make assumptions about existing implementations." and "If information is missing, explicitly tell me instead of guessing".

### User's clarification answers (verbatim where I have them)
1. "The kiosk is the browser itself and it feels like they are connected to the tester accounts, try to ignore this for now."
3. "hard delete. also the admin can remove another admin but it cannot change other roles to prevent having the website not having an admin existing."
4. "end the session, yes it should disable the session until the admin enables it for the tester to use"
5. "end a live one. basically its like a 2-way for the admin and tester. …"
6. "admin only"
7. "No" (no audit log / extra item)
8. "ignore this one for now"
Item 2 was left blank and resolved via multiple-choice questions: reset access = "Temp password + force logout (Recommended)"; ended session = "End as incomplete (Recommended)"; role rule = "Always keep at least one admin (Recommended)"; camera vs kiosk = "Different, per tester account (Recommended)". (The other options offered were not retained in my notes.)

### Functional requirements (derived)
- All new actions admin-only, enforced on the server (`requireAdmin`) and in the UI.
- Admin actions need confirmation and clear success/failure messages, including whether the live kiosk was notified.
- Existing tests must keep passing: `tests/reconnect.test.mjs` slices the **source text** of `server.js`, `VideoMonitoring.tsx`, `TesterSession.tsx` (handler extraction expects `    socket.on("name",` with 4-space indentation up to `\n    });`). Preserve those patterns when editing.

### Non-functional / constraints
- Keep new columns in `init.js` via `addColumnIfMissing`.
- No new dependencies were added.
- Docs/README were NOT updated.
- Document formatting rules (citation style, chapter structure, templates): **None discussed**.

---

## 7. Documentation status

| Document | Status |
|---|---|
| CAP2 paper chapters (`Copy_CAP-2518-IT-CAP2DOC.md`) | Read and analyzed only. Not edited. Needs updating: new admin management, kiosk/camera controls, access revocation, and the corrected control-plane description (Socket.IO rooms, not the central-api WebSocket registry). |
| Demo Kit | **None discussed** |
| Walkthrough / User's Manual | Read only. Needs new sections: Users page (Reset access, Delete), kiosk control panel, "End live session → survey" tester behaviour, Disabled filter and card chips. |
| Installation Manual | **None discussed**. Likely needs the new `scripts/rebuild-familis-app.ps1`, new env `RESET_DEFAULT_ADMIN`, and the non-destructive seeding note. |
| Technical Manual | **None discussed**. Needs the new endpoints/socket events (Section 8) and the 4 new `users` columns. |
| Metrics guide (`FaMiLiS_Metrics_Local_Access_Guide.md`) | Read only. The new `kiosk-controls-*` data is not in Prometheus; no metric changes made. |
| README | Not updated. |

### Progress checklist I gave the user for their adviser (reproduced)
Planning: read docs, inspected repo, wrote plan with decisions. Admin user management implemented (delete, reset access, last-admin guard, immediate revocation, admin-only Users page, seeding fix). Kiosk/camera control implemented with server-side enforcement. Monitoring improvements implemented (chips, Disabled filter, control panel, smaller preview, preview fix). Checks run: TypeScript check passes; 10 automated tests pass (4 existing + 6 new). **Not yet confirmed:** new build running on Docker Desktop; end-to-end tests with real admin and tester browsers; the camera preview fix and survey redirect (user reported "it didn't work"); not changed: room-code hardening, device registration, docs updates.

---

## 8. Code- and system-specific details

### Repo layout
Repo root (the user's folder): `familis-multiunit-deployment/` with `README.md`, `central-server/`, `certs/`, `k8s/` (`k8s/base/*.yaml`), `kiosk-image/` (`Dockerfile`, `Dockerfile.hotfix`, `start.sh`, `open-firewall-ports.ps1`, `FaMiLiS/`), `monitoring/`, `scripts/` (`backup-familis.ps1`, `check-familis.ps1`, `new-familis-certificate.ps1`, `start-familis.ps1`, `stop-familis.ps1`, `watch-public-access.py`, and the new `rebuild-familis-app.ps1`).
App code: `kiosk-image/FaMiLiS/` with `server/` (`server.js`, `init.js`, new `accessControl.js`), `server_database/schema.sql`, `src/`, `tests/`, `package.json`.

### Files created
- `kiosk-image/FaMiLiS/server/accessControl.js`: pure helpers: `AUTH_TOKEN_TTL_SECONDS_DEFAULT` (12 h), `tokenIssuedAt`, `evaluateAccess(auth,row,ttl)` returning `{allowed,reason: missing|inactive|revoked}`, `wouldLeaveNoAdmin(activeAdminIds,targetId)`, `generateTemporaryPassword(randomBytes)` (currently unused by `server.js`).
- `kiosk-image/FaMiLiS/src/components/users/UserDeleteDialog.tsx`
- `kiosk-image/FaMiLiS/tests/access-control.test.mjs` (6 tests)
- `scripts/rebuild-familis-app.ps1`

### Files modified
`server/init.js`, `server/server.js`, `src/RequireAuth.tsx`, `src/RequireRole.tsx`, `src/components/PageHeader.tsx`, `src/components/users/{UserPasswordModal,UserRow,index}.tsx|ts`, `src/pages/{AdminPreferences,AdminUsers,TesterSession,VideoMonitoring}.tsx`.

### API (new/changed), all behind `requireAuth` (+`requireAdmin` where noted)
- `GET/POST/PATCH /api/users…` now `requireAdmin` (were `requireTabAccess("users")`). `GET` also returns `lastLogin`, `kioskEnabled`, `cameraEnabled`.
- `DELETE /api/users/:userId` (admin): response `{ok, deletedUserId, deletedSessions, notified}`. 400 on self-delete, 409 if it would remove the last active admin, 404 if missing.
- `POST /api/users/:userId/reset-access` body `{password}` (min 6): `{ok, revoked, notified}`.
- `PATCH /api/users/:userId/kiosk-controls` body `{kioskEnabled?: boolean, cameraEnabled?: boolean}` (tester accounts only): `{ok, kioskEnabled, cameraEnabled, endedSessions, notified}`.
- `POST /api/users/:userId/end-session` (admin, tester only): `{ok, endedSessions, notified}`.
- `GET /api/kiosks/testers` (monitor tab) now returns `kioskEnabled`, `cameraEnabled`, `lastFrameAt`.
- `GET /api/auth/me` now returns `{ok, user, access:{kioskEnabled,cameraEnabled}}`.
- Enforcement error codes (HTTP 403 with `code`): `KIOSK_DISABLED`, `CAMERA_DISABLED` (on `/api/sessions/start`, the frames route, and `/api/testing-rooms/validate`). Access failures return 401 with `code` `ACCESS_MISSING|ACCESS_INACTIVE|ACCESS_REVOKED`; 503 if the access check cannot read the DB.
- Existing, unchanged but relevant: `POST /api/login` (`validateOnly` skips cookie), `POST /api/sessions/start`, `POST /api/sessions/:id/frames`, `POST /api/sessions/:sessionId/stop` (sets `status='pending'`, `end_time=COALESCE(end_time,NOW())`), `POST /api/sessions/:sessionId/survey`, `DELETE /api/participants/:id`, `DELETE /api/sessions/:sessionId`, `/api/testing-rooms*`, `PUT /api/preferences`.

### Socket.IO events
- New server→client: `access-revoked {reason}`, `session-ended-by-admin {sessionIds, reason}` (reasons: `kiosk-disabled`, `camera-disabled`, `ended-by-admin`), `kiosk-controls-changed {kioskEnabled,cameraEnabled}` (to the tester's sockets), `kiosk-controls-updated {testerId,kioskEnabled,cameraEnabled}` (to the admin presence room `__familis_admin_presence__`), `room-error {error, code}` (code `KIOSK_DISABLED`).
- New client→server: `tester-camera-status {state: "on"|"off"|"blocked"|"unavailable"}`; the presence snapshot (`tester-presence-snapshot`) now includes `cameraState`.
- Existing: `join-room`, `monitor-all-rooms`, `tester-presence-update`, `tester-session-status`, `tester-recording-heartbeat`, `request-stream`/`stop-stream`, `signal`, `viewer-connected`, `host-connected`, `host-disconnected`, `user-disconnected`, `tester-reconnecting`, `tester-reconnect-expired`, `tester-logged-out`, `session-reconnect-lease`, `session-reconnect-expired`.
- Reconnect lease `TESTER_RECONNECT_TIMEOUT_MS = 90_000`; Socket.IO `pingTimeout: 10000`, `pingInterval: 5000`; presence disconnect timer 20 s.

### Auth details
- Cookie `familis_session` (HMAC-signed, `AUTH_TOKEN_SECRET`, TTL 12 h, now with `iat`). Access cache TTL `ACCESS_CACHE_TTL_MS = 5_000`, invalidated by `invalidateAccessCache(userId)`. `disconnectUserSockets(userId, reason)` emits `access-revoked` then disconnects all of the user's sockets. If `AUTH_TOKEN_SECRET` is not set, logins reset on server restart.
- Tester frame uploads: HTTPS relay fallback `USE_HTTPS_FRAME_RELAY` (polls `/latest-frame`, admin only) when hostname is not localhost/private.
- Frame data flow: browser → Express `POST /api/sessions/:id/frames` → central-api `/api/ingest/frame` (with `X-Internal-Token`) → Kafka `video-frames` → `fer-worker` → JPEG on shared PVC (`uploads/frame_logs/<sessionId>/<frameId>.jpg`) + `emotion_results` + `frame_logs` rows.
- `TesterSession.tsx`: `FRAME_CAPTURE_MS = 750`, `MAX_FRAME_WIDTH = 960`, `ACTIVE_TESTER_SESSION_KEY = "familis.activeTesterRecording"`, local storage keys `familis.user`, `familis.currentSession`, `familis.token`, `familis.consent`. NOTE: `TesterSession.tsx` imports `performLogout` from `../auth` (single-argument), while `RequireAuth.tsx` exports a different `performLogout(navigate, {clearSession})`.

### Environment variables seen
`AUTH_TOKEN_SECRET`, `DATABASE_URL` or `DB_HOST`/`DB_PORT` (default 3306)/`DB_USER` (default root)/`DB_PASSWORD`/`DB_NAME` (default `familis_central`), `PORT` (8080 for the API), `USE_HTTPS`, `SSL_KEY_FILE`, `SSL_CERT_FILE`, `HOST_LAN_IP`, `PUBLIC_ACCESS_URL`, `CENTRAL_SERVER_URL`, new `RESET_DEFAULT_ADMIN` (`"true"` forces the default admin to be recreated/reset on startup), Vite `VITE_API_URL`, `VITE_WS_URL`.

### Commands
Deploy (run by the **user** in PowerShell from `familis-multiunit-deployment`):

    .\scripts\rebuild-familis-app.ps1

The script runs: `docker build -t "familis-app:$version" .\kiosk-image` (version `local-yyyyMMddHHmmss`), finds the node with `kubectl get nodes -o jsonpath='{.items[0].metadata.name}'`, `docker save` → `docker cp` → `docker exec $node ctr -n k8s.io images import --all-platforms`, retags `docker.io/library/familis-app:$version` as `docker.io/library/familis-app:k8s`, removes the tar, then `kubectl -n familis rollout restart deployment/familis` and `rollout status ... --timeout=300s`. (If scripts are blocked: `powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-familis-app.ps1`.)
Other useful: `kubectl -n familis get pods`, `kubectl -n familis rollout restart deployment/central-api deployment/fer-worker deployment/familis`; k8s deployments: `central-api`, `fer-worker`, `familis` (image `familis-app:k8s`), namespace `familis`; app reachable at `https://localhost` (Traefik, self-signed cert). Quick check that the new code is live: fetch `/src/pages/AdminUsers.tsx` from `https://localhost` and look for `onResetAccess` / `KioskControlPanel`.
Local dev: `npm ci`, `npm run server` (API), `npm run dev` (Vite), `npx tsc -b` (typecheck), `npm run lint`.
Tests: run `node --test tests/*.test.mjs` (**`node --test tests/` fails** because it treats the directory as a module). `tests/reconnect.test.mjs` needs `npm ci` (it imports `typescript`).

### Test results (all on a scratch copy with `npm ci`)
- `npx tsc -b`: clean after the final edits (earlier one error fixed: wrong `performLogout` signature in `TesterSession.tsx`).
- `node --test tests/*.test.mjs`: 10 tests, 10 pass (4 existing reconnect tests + 6 new access-control tests). Last run before the final "survey redirect" edit's second round was also 10/10.
- Never run: the server against a real MySQL, browser end-to-end tests, camera/WebRTC flow, the Kubernetes redeploy. **(unverified)**

### Credentials/accounts
- Default seeded admin: `admin@familis.com` (password is the seed default hardcoded in `server/init.js`; the user told me it in chat; not repeated here). Seeded testers: `tester01@familis.com` … `tester30@familis.com` (seed password in `init.js`).
- Was able to open the login page of the user's running app at `https://localhost` in the built-in browser; I did not sign in (the old build was served).

---

## 9. My preferences and working style

- Wants an **investigation and plan first**, then explicit approval before any code ("Do not implement anything yet" / "do whats necessary" as the go-ahead).
- Wants strict honesty about unknowns: "If information is missing, explicitly tell me instead of guessing".
- Writes casually in lowercase and short sentences; wants practical, actionable answers rather than long explanations.
- Wants Claude to **actually perform** actions ("i need you to actually automate it", "run them in powershell for me will you", "can you do it for me and run a browser for it"). When I could not, they were frustrated; be upfront about what the tool environment can and cannot do. In Claude Code, run the deploy commands yourself.
- Likes checklists to show their adviser (asked for one for progress updates).
- Corrections / feedback given: "i cant see the changes yet" (the build wasn't deployed); the camera preview not reappearing after re-enable; the preview being too large ("i had to zoom out the website to be able to click the disable enable kiosk or cameras there"); "it didn't work" after the last redeploy (unspecified).
- Document/formatting preferences: **None discussed**.

---

## 10. Next steps (prioritized)

1. **Find out why "it didn't work".** Ask the user which feature/symptom; check `kubectl -n familis get pods`, `kubectl -n familis rollout status deployment/familis`, `kubectl -n familis logs deployment/familis --tail=200`; confirm the served source contains the new code (see Section 8). Files: `scripts/rebuild-familis-app.ps1`, `k8s/base/familis.yaml`, `kiosk-image/Dockerfile`, `kiosk-image/start.sh`.
2. **Redeploy the latest code** (includes the preview-size fix, preview-reappear fix, and survey redirect) and verify with an admin + a tester account in two browsers: delete user, reset access (tester should be signed out), disable/enable camera, disable/enable kiosk, End live session → tester lands on `/tester-survey`; admin preview reappears after re-enabling and restarting a session. Files: `server/server.js`, `src/pages/TesterSession.tsx`, `src/pages/VideoMonitoring.tsx`, `src/pages/AdminUsers.tsx`.
3. **Fix whatever the live test reveals** in the WebRTC re-offer logic (admin pc recreation in the `signal` handler of `VideoMonitoring.tsx`; `publishCameraStream`/`applyControls` in `TesterSession.tsx`).
4. **Resolve open decisions with the user:** (a) should Disable camera / Disable kiosk also route to the survey (currently yes), (b) should an admin-ended session stay incomplete after a survey (currently the survey marks it `completed`). Files: `server/server.js` survey route; `TesterSession.tsx` `handleAdminEnded`.
5. **Clean up pre-existing gaps** if wanted: make `DELETE /api/participants/:id` use the same cleanup as `DELETE /api/users/:userId` (cache invalidation, sockets, frame files, `emotion_results`); `DELETE /api/sessions/:id` should remove `emotion_results`. File: `server/server.js`.
6. **Persist drifted schema** (optional): add the 4 new `users` columns to `server_database/schema.sql` and `k8s` MySQL init configmap, or leave to `init.js`. Files: `server_database/schema.sql`, `k8s/base/*mysql-init*`.
7. **Update the documentation** to match: CAP2DOC, Walkthrough/User's Manual, Installation/Technical manuals (Section 7 lists what changed). Document: the new endpoints, `RESET_DEFAULT_ADMIN`, the non-destructive seeding, the admin-only Users tab, kiosk controls behaviour, and the corrected architecture (Socket.IO control plane).
8. **Lint hygiene** (optional): the ~17 pre-existing ESLint errors; the files I touched introduced no new ones after fixes (`RequireAuth.tsx` uses a `navigateRef` to avoid reconnecting the presence socket on navigation).
9. Add automated tests for server routes if a test DB becomes available (none exist; current tests only cover the pure helpers and the reconnect source patterns).
10. Revisit the deferred items only if the user asks: device registration, room-code hardening (replace `Math.random`, rate-limit validation), audit log.

---

## 11. Glossary

- **FaMiLiS**: name of the code/repo directory and original project name; **ChauFER**: the current name of the capstone.
- **FER**: Facial Emotion Recognition. Frames from the tester's camera are analyzed to estimate emotion (columns include `face_detected`, `hedonic_score`, `confidence`, `valence`).
- **Valence**: positive/negative affect dimension of the emotion estimate; **hedonic score/scale**: liking score for the food (survey ratings are 1–9: color, flavor/aroma, salt/sweet, texture, final overall).
- **Tester / taster**: end user with role `tester` who tastes and is recorded; **staff**, **admin**: operator roles (admin sees everything; staff access is configured through Preferences `roleTabAccess`).
- **Participant**: a record in the `participants` table, linked to a tester by email.
- **Kiosk**: in practice the tester's browser tab (identified by a browser kiosk id and tied to the tester account); the older docs also describe registered kiosk devices via the central-api WebSocket registry (unused in code).
- **Testing room / room code**: an admin-created active test for a food (`testing_rooms`), identified by a 6-digit `room_code`, one active per food; testers must enter it. Called the "tester access code" in the revision request.
- **Session**: a recording of one tester tasting one food (`sessions`: `status` values include `active`, `pending` (stopped/incomplete), `completed` (after survey)).
- **Frame / frame_logs / emotion_results**: a captured JPEG, its stored log row, and the FER output for it.
- **Presence**: in-memory record of logged-in testers (stage `logged_in|consent_pending|ready|survey`), pushed to admin monitors.
- **Reconnect lease**: 90-second window during which a recording tester can reconnect before the session is expired/ended.
- **Access revocation (`access_revoked_at`)**: timestamp; tokens issued at or before it are rejected.
- **kiosk_enabled / camera_enabled**: new per-tester switches (see Section 4).
- **central-api / fer-worker**: FastAPI service and the Kafka consumer pods that run the FER model; **Kafka topic `video-frames`**: queue of frames (6 partitions); **HPA**: Kubernetes HorizontalPodAutoscaler (1–6 workers); **PVC**: shared volume for frame images; **Traefik**: ingress controller; **Docker Desktop Kubernetes vs kind**: the two cluster flavors mentioned by the docs.
- **Cowork / Claude Code**: Cowork is the Claude desktop app mode used in this chat; this handoff is for continuing in Claude Code.
