# FaMiLiS Multi-Unit Deployment

Distributed Facial Emotion Recognition (FER) deployment for multiple FaMiLiS kiosks.

The current primary flow is the browser-based FaMiLiS kiosk UI. Kafka is still part of the system and is used by the central FastAPI service for the central FER/event pipeline. The old native Python `client-agent` flow remains available only as a legacy/manual test path.

## Architecture

```text
Browser kiosk UI
  -> Vite React app on 5173
  -> Express API + Socket.IO on 8080
  -> Python emotion service on 8765
  -> MySQL familis_central database
  -> dashboard analytics, sessions, surveys, frame logs

Central service
  -> FastAPI on 8000
  -> Kafka producer/consumer
  -> Kafka topic: video-frames
  -> MySQL emotion_results

Legacy native client-agent, optional
  -> WebSocket commands from FastAPI
  -> frame ingest through Kafka
  -> central FER processing
```

## Repository Layout

```text
familis-multiunit-deployment/
  central-server/
    app/
    models/
    Dockerfile
    docker-compose.yaml
    requirements.txt
    .dockerignore
  certs/
    cert.pem
    key.pem
  kiosk-image/
    Dockerfile
    start.sh
    .dockerignore
    FaMiLiS/
      backend/
      server/
      server_database/schema.sql
      src/
      package.json
      package-lock.json
  client-agent/        # legacy/manual native camera path
  send_start.py        # legacy command helper
  send_stop.py         # legacy command helper
  README.md
```

## Requirements

- Docker Desktop
- Docker Compose
- Browser with camera permissions
- Access to the Docker host on ports `5173`, `8080`, `8765`, and `8000`

For local non-Docker frontend/backend development, also install:

- Node.js
- Python 3.11+

## HTTPS Certificates

HTTPS is handled by the certs in the root `certs/` folder:

```text
certs/cert.pem
certs/key.pem
```

`central-server/docker-compose.yaml` mounts that folder into the FaMiLiS container at `/app/certs` and sets:

```text
USE_HTTPS=true
SSL_KEY_FILE=/app/certs/key.pem
SSL_CERT_FILE=/app/certs/cert.pem
```

The Vite dev server reads those values in `kiosk-image/FaMiLiS/vite.config.ts`.

## Docker Build Notes

The Docker build contexts intentionally ignore generated folders and local dependencies:

```text
kiosk-image/FaMiLiS/node_modules/
client-agent/venv/
**/__pycache__/
**/*.pyc
```

This makes Docker initialization and rebuilds faster. Do not commit or copy local `node_modules`, Python virtual environments, cache folders, logs, or generated frames into the image context.

Keep these files because they recreate dependencies:

```text
kiosk-image/FaMiLiS/package.json
kiosk-image/FaMiLiS/package-lock.json
central-server/requirements.txt
kiosk-image/FaMiLiS/backend/requirements.txt
```

## Start The Full Stack

From the repository root:

```powershell
cd central-server
docker compose up -d --build
```

This starts:

```text
zookeeper
kafka
kafka-init
central-mysql
central-server
familis
```

`kafka-init` creates the `video-frames` topic. MySQL initializes the database from:

```text
kiosk-image/FaMiLiS/server_database/schema.sql
```

If you need to recreate the database from a clean schema:

```powershell
docker compose down -v
docker compose up -d --build
```

## Check Services

From `central-server/`:

```powershell
docker compose ps
```

Central FastAPI health:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health
```

Expected shape:

```json
{"status":"ok","kiosks_connected":0,"kafka_ready":true}
```

FaMiLiS Express API health:

```powershell
Invoke-WebRequest -UseBasicParsing https://localhost:5173/api/health
```

If the local certificate is self-signed, the browser may ask you to accept it before camera features work.

## Open The App

Open:

```text
https://localhost:5173
```

Main routes:

```text
/                 login
/signup           signup
/dashboard        admin dashboard
/kiosk            protected kiosk host
/kiosk/setup      public kiosk setup
/kiosk/session    public kiosk session
/kiosk/survey     public kiosk survey
/video-monitoring admin video monitoring
```

The FaMiLiS container runs:

```text
5173  Vite React app
8080  Express API + Socket.IO
8765  Python emotion service
8000  FastAPI central service, exposed by central-server container
```

## Check Kafka

From `central-server/`:

```powershell
docker exec kafka kafka-topics --bootstrap-server kafka:9092 --list
```

Expected:

```text
__consumer_offsets
video-frames
```

List consumer groups:

```powershell
docker exec kafka kafka-consumer-groups --bootstrap-server kafka:9092 --list
```

Expected:

```text
fer-processor-group
```

## Check MySQL

From `central-server/`:

```powershell
docker exec -it central-mysql mysql -uroot -proot
```

Inside MySQL:

```sql
USE familis_central;
SHOW TABLES;
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM frame_logs;
SELECT COUNT(*) FROM emotion_results;
```

One-shot check:

```powershell
docker exec central-mysql mysql -uroot -proot -e "USE familis_central; SHOW TABLES; SELECT COUNT(*) AS session_count FROM sessions; SELECT COUNT(*) AS frame_log_count FROM frame_logs; SELECT COUNT(*) AS emotion_result_count FROM emotion_results;"
```

## Logs

From `central-server/`:

```powershell
docker logs central-server
docker logs familis
docker logs kafka
docker logs kafka-init
docker logs central-mysql
```

## Stop The Stack

From `central-server/`:

```powershell
docker compose down
```

To stop and remove the database volume:

```powershell
docker compose down -v
```

## Local Development

Install frontend/server dependencies:

```powershell
cd kiosk-image\FaMiLiS
npm install
```

Run the Vite app:

```powershell
npm run dev
```

Run the Express API:

```powershell
npm run server
```

Run the Python emotion service:

```powershell
cd backend
pip install -r requirements.txt
python emotion_service.py
```

## Legacy Native Client-Agent

Only use this if you still need the old native Python kiosk camera path.

From the repo root:

```powershell
cd client-agent
pip install -r requirements.txt
python agent.py
```

Default values:

```text
KIOSK_ID=kiosk-01
CENTRAL_SERVER_HTTP=http://localhost:8000
CENTRAL_SERVER_WS=derived from CENTRAL_SERVER_HTTP
WEBCAM_ID=auto
CAMERA_SCAN_MAX_INDEX=5
SHOW_PREVIEW=1
WARM_CAMERA_ON_CONNECT=0
CAMERA_BACKEND=auto
```

Run a different kiosk:

```powershell
$env:KIOSK_ID="kiosk-02"
python agent.py
```

Send legacy start/stop commands:

```powershell
python send_start.py
python send_stop.py
```

Override command defaults:

```powershell
$env:KIOSK_ID="kiosk-02"
$env:SESSION_ID="session-001"
$env:CENTRAL_SERVER_HTTP="http://localhost:8000"
python send_start.py
```

## Troubleshooting

If Docker rebuilds are slow:

```text
1. Make sure node_modules is not copied into the Docker context.
2. Make sure Python venv folders are not copied into the Docker context.
3. Check kiosk-image/.dockerignore and central-server/.dockerignore.
4. Rebuild with docker compose up -d --build from central-server/.
```

If Kafka is not ready:

```powershell
docker logs kafka
docker logs kafka-init
docker exec kafka kafka-topics --bootstrap-server kafka:9092 --list
```

If the app cannot reach MySQL:

```powershell
docker logs central-mysql
docker exec central-mysql mysql -uroot -proot -e "SHOW DATABASES;"
```

If the browser blocks camera access:

```text
1. Use HTTPS.
2. Accept the local certificate warning in the browser.
3. Confirm camera permissions are allowed for https://localhost:5173.
```

If the legacy client-agent says the kiosk is not connected:

```text
1. Make sure python agent.py is running.
2. Make sure the agent log says it registered the expected kiosk id.
3. Make sure send_start.py targets the same KIOSK_ID.
4. Check http://localhost:8000/api/commands/kiosks.
```
